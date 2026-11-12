import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";

type Props = { onBack: () => void };
type Subscription = { plan: string; status: string; current_period_end: string | null } | null;

function hasAccess(subscription: Subscription) {
  if (!subscription || subscription.plan !== "pro") return false;
  if (subscription.status !== "active" && subscription.status !== "cancelled") return false;
  const end = subscription.current_period_end ? new Date(subscription.current_period_end).getTime() : Number.NaN;
  return Number.isFinite(end) && end > Date.now();
}

export default function NativeSubscriptionScreen({ onBack }: Props) {
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [signedIn, setSignedIn] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) {
        setSignedIn(false);
        setSubscription(null);
        setMessage("Sign in to view your Developer Pro subscription.");
        return;
      }
      setSignedIn(true);
      const { data, error } = await supabase.from("subscriptions")
        .select("plan,status,current_period_end")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (error) throw error;
      setSubscription(data as Subscription);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load subscription details.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const openSecureManagement = async () => {
    setBusy(true);
    setMessage("");
    try {
      await Linking.openURL("https://malawian-app-store.vercel.app/console/subscription");
      setMessage("The secure subscription page has opened. Sign in there if requested. Checkout and cancellation are confirmed server-side.");
    } catch {
      setMessage("Could not open subscription management. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const active = hasAccess(subscription);
  const cancelled = subscription?.status === "cancelled" && active;
  const periodEnd = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;

  if (loading) return <View style={s.center}><ActivityIndicator color="#1A73E8" /></View>;
  return <ScrollView style={s.root} contentContainerStyle={s.content}>
    <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backText}>‹  Developer dashboard</Text></TouchableOpacity>
    <Text style={s.eyebrow}>DEVELOPER ACCOUNT</Text>
    <Text style={s.title}>Developer Pro</Text>
    <Text style={s.copy}>Professional tools for developers building in Malawi's digital ecosystem.</Text>

    <View style={s.panel}>
      <Text style={s.price}>MK 5,000</Text>
      <Text style={s.copy}>per month</Text>
      <View style={[s.statusPill, active ? s.active : s.inactive]}><Text style={s.statusText}>{active ? (cancelled ? "Cancelled · access remains active" : "Active") : "Free plan"}</Text></View>
      {periodEnd ? <Text style={s.copy}>{cancelled ? "Access ends" : "Current period ends"} {periodEnd}</Text> : null}
      <Text style={s.body}>{active ? "Your Pro entitlement is currently active." : "Upgrade when you need the additional publishing and growth tools."}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={busy || !signedIn} onPress={() => void openSecureManagement()} style={[s.button, (busy || !signedIn) && s.disabled]}>
        <Text style={s.buttonText}>{busy ? "Opening…" : active && !cancelled ? "Manage or cancel plan" : "Upgrade to Developer Pro"}</Text>
      </TouchableOpacity>
      <Text style={s.note}>Payments and cancellations are handled by the MAS secure server flow and PayChangu. This screen never writes subscription status directly.</Text>
    </View>

    <View style={s.section}>
      <Text style={s.heading}>Included with Pro</Text>
      {[
        "Publish unlimited eligible products",
        "Promote products across MAS",
        "Advanced analytics and growth insights",
        "Priority Spotlight consideration",
        "Eligible local Kwacha payment support",
      ].map((item) => <View key={item} style={s.benefit}><Text style={s.check}>✓</Text><Text style={s.benefitText}>{item}</Text></View>)}
    </View>

    <View style={s.section}>
      <Text style={s.heading}>Important</Text>
      <Text style={s.copy}>Developer Pro is not required to receive legitimate future earnings. Identity verification is free and cannot be purchased through a subscription.</Text>
      <Text style={s.copy}>MAS does not currently offer a developer wallet or withdrawals. Those features remain unavailable until a verified payment ledger and payout system are implemented.</Text>
    </View>
    <TouchableOpacity onPress={() => void refresh()} style={s.refresh}><Text style={s.refreshText}>Refresh subscription status</Text></TouchableOpacity>
    {message ? <Text accessibilityRole="alert" style={s.message}>{message}</Text> : null}
  </ScrollView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F6F7FB" },
  content: { padding: 16, paddingBottom: 36 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  back: { paddingVertical: 8, marginBottom: 12 },
  backText: { color: "#1A73E8", fontSize: 13, fontWeight: "600" },
  eyebrow: { color: "#1A73E8", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  title: { color: "#111827", fontSize: 25, fontWeight: "700", marginTop: 4 },
  copy: { color: "#64748B", fontSize: 12, lineHeight: 18, marginTop: 6 },
  panel: { backgroundColor: "#FFF", borderRadius: 12, padding: 16, marginTop: 16, borderWidth: 1, borderColor: "#E7EBF3" },
  price: { color: "#111827", fontSize: 29, fontWeight: "700" },
  statusPill: { alignSelf: "flex-start", borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5, marginTop: 12 },
  active: { backgroundColor: "#E8F5E9" },
  inactive: { backgroundColor: "#EEF2F7" },
  statusText: { color: "#334155", fontSize: 11, fontWeight: "700" },
  body: { color: "#334155", fontSize: 13, lineHeight: 19, marginTop: 12 },
  button: { minHeight: 44, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: "#1A73E8", marginTop: 16, paddingHorizontal: 12 },
  buttonText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  disabled: { opacity: 0.5 },
  note: { color: "#64748B", fontSize: 10, lineHeight: 15, marginTop: 12 },
  section: { marginTop: 22 },
  heading: { color: "#111827", fontSize: 15, fontWeight: "700" },
  benefit: { flexDirection: "row", alignItems: "flex-start", gap: 9, marginTop: 12 },
  check: { color: "#188038", fontWeight: "800" },
  benefitText: { color: "#334155", fontSize: 12, flex: 1 },
  refresh: { alignItems: "center", paddingVertical: 16 },
  refreshText: { color: "#1A73E8", fontSize: 12, fontWeight: "700" },
  message: { color: "#334155", fontSize: 12, lineHeight: 18, marginTop: 8 },
});
