import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";

const WEB = "https://malawian-app-store.vercel.app";
type Props = { onBack: () => void };
type Profile = { display_name: string | null; developer_name: string | null; bio: string | null };

export default function NativeDeveloperSettingsScreen({ onBack }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [developerName, setDeveloperName] = useState("");
  const [bio, setBio] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      setUserId(null);
      setProfile(null);
      setMessage(authError?.message || "Sign in to manage developer settings.");
      setLoading(false);
      return;
    }
    setUserId(auth.user.id);
    const { data, error } = await supabase.from("profiles")
      .select("display_name,developer_name,bio")
      .eq("id", auth.user.id).maybeSingle();
    if (error) setMessage(error.message);
    const row = data as Profile | null;
    setProfile(row);
    setDisplayName(row?.display_name ?? "");
    setDeveloperName(row?.developer_name ?? "");
    setBio(row?.bio ?? "");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!userId) return;
    const cleanDisplay = displayName.trim();
    const cleanDeveloper = developerName.trim();
    const cleanBio = bio.trim();
    if (cleanDisplay.length > 80 || cleanDeveloper.length > 80 || cleanBio.length > 300) {
      setMessage("Display and developer names must be 80 characters or fewer. Bio must be 300 characters or fewer.");
      return;
    }
    setBusy(true);
    setMessage("");
    const { error } = await supabase.from("profiles").update({
      display_name: cleanDisplay || null,
      developer_name: cleanDeveloper || null,
      bio: cleanBio || null,
    }).eq("id", userId);
    if (error) setMessage(error.message);
    else { setMessage("Developer profile saved."); await load(); }
    setBusy(false);
  };

  const open = async (path: string) => {
    try { await Linking.openURL(WEB + path); }
    catch { setMessage("Could not open the secure MAS account page."); }
  };

  if (loading) return <View style={s.center}><ActivityIndicator color="#1A73E8" /></View>;
  return <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backText}>‹  Developer dashboard</Text></TouchableOpacity>
    <Text style={s.eyebrow}>DEVELOPER ACCOUNT</Text>
    <Text style={s.title}>Account settings</Text>
    <Text style={s.copy}>Edit the public identity attached to your developer account. Security-sensitive actions stay in MAS secure account pages.</Text>
    {userId ? <View style={s.panel}>
      <Text style={s.heading}>Developer profile</Text>
      <Text style={s.label}>Display name</Text>
      <TextInput value={displayName} onChangeText={setDisplayName} maxLength={80} placeholder="Your display name" style={s.input} />
      <Text style={s.label}>Developer or studio name</Text>
      <TextInput value={developerName} onChangeText={setDeveloperName} maxLength={80} placeholder="Developer name" style={s.input} />
      <Text style={s.label}>Bio</Text>
      <TextInput value={bio} onChangeText={setBio} maxLength={300} multiline textAlignVertical="top" placeholder="Describe your work" style={[s.input, s.bio]} />
      <Action title={busy ? "Saving…" : "Save profile"} disabled={busy} onPress={() => void save()} />
    </View> : null}
    <View style={s.panel}>
      <Text style={s.heading}>Account and security</Text>
      <Text style={s.copy}>Password, sign-in methods, sessions and account protection are handled by the authenticated MAS security workflow.</Text>
      <Action title="Open security settings" onPress={() => void open("/console/security")} />
      <Action title="Open account preferences" onPress={() => void open("/settings")} secondary />
    </View>
    <View style={s.panel}>
      <Text style={s.heading}>Public store presence</Text>
      <Text style={s.copy}>Manage the developer page and the public details shoppers see in the store.</Text>
      <Action title="Manage store presence" onPress={() => void open("/console/store")} />
    </View>
    {message ? <Text accessibilityRole="alert" style={s.message}>{message}</Text> : null}
    <TouchableOpacity onPress={() => void load()} style={s.refresh}><Text style={s.backText}>Refresh settings</Text></TouchableOpacity>
  </ScrollView>;
}
function Action({ title, onPress, disabled, secondary }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && { opacity: 0.55 }]}><Text style={[s.buttonText, secondary && s.secondaryText]}>{title}</Text></TouchableOpacity>;
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F6F7FB" }, content: { padding: 16, paddingBottom: 36 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" }, back: { paddingVertical: 8, marginBottom: 12 },
  backText: { color: "#1A73E8", fontSize: 13, fontWeight: "600" }, eyebrow: { color: "#1A73E8", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  title: { color: "#111827", fontSize: 25, fontWeight: "700", marginTop: 4 }, copy: { color: "#64748B", fontSize: 12, lineHeight: 18, marginTop: 6 },
  panel: { backgroundColor: "#FFF", borderRadius: 12, padding: 14, marginTop: 14, borderWidth: 1, borderColor: "#E7EBF3" },
  heading: { color: "#111827", fontSize: 15, fontWeight: "700", marginBottom: 8 }, label: { color: "#64748B", fontSize: 11, fontWeight: "600", marginTop: 9 },
  input: { minHeight: 44, borderWidth: 1, borderColor: "#DCE2EA", borderRadius: 9, paddingHorizontal: 11, marginTop: 6, color: "#111827", backgroundColor: "#FFF" },
  bio: { minHeight: 96, paddingTop: 10 }, button: { backgroundColor: "#1A73E8", minHeight: 42, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, marginTop: 10 },
  buttonText: { color: "#FFF", fontSize: 12, fontWeight: "700" }, secondary: { backgroundColor: "#EFF4FA" }, secondaryText: { color: "#1A73E8" },
  message: { color: "#334155", fontSize: 12, lineHeight: 18, marginTop: 12 }, refresh: { paddingVertical: 15, alignItems: "center" },
});
