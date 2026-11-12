import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";

type Range = 7 | 30 | 90;
type Stat = { day: string; installs: number; views: number };
type Listing = { id: string; name: string; kind: string; status: string; downloads: number | null; rating_avg: number | null; rating_count: number | null };
type Subscription = { plan: string | null; status: string | null; current_period_end: string | null } | null;

function hasPaidPro(value: Subscription) {
  if (!value || value.plan !== "pro" || (value.status !== "active" && value.status !== "cancelled")) return false;
  const end = value.current_period_end ? Date.parse(value.current_period_end) : NaN;
  return Number.isFinite(end) && end > Date.now();
}
const number = (value: number) => new Intl.NumberFormat("en").format(value);

export default function NativeAnalyticsScreen({ onBack }: { onBack: () => void }) {
  const [range, setRange] = useState<Range>(30);
  const [userId, setUserId] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [stats, setStats] = useState<Stat[]>([]);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error("Sign in to view developer analytics.");
      const id = auth.user.id; setUserId(id);
      const [subResult, listingResult] = await Promise.all([
        supabase.from("subscriptions").select("plan,status,current_period_end").eq("user_id", id).maybeSingle(),
        supabase.from("listings").select("id,name,kind,status,downloads,rating_avg,rating_count").eq("developer_id", id).order("updated_at", { ascending: false }),
      ]);
      if (subResult.error) throw subResult.error;
      if (listingResult.error) throw listingResult.error;
      const sub = (subResult.data ?? null) as Subscription;
      setSubscription(sub);
      const products = (listingResult.data ?? []) as Listing[];
      setListings(products);
      if (!hasPaidPro(sub)) { setStats([]); return; }
      const { data, error: statsError } = await supabase.rpc("developer_stats", { _developer: id, _days: range });
      if (statsError) throw statsError;
      setStats((data ?? []).map((row: { day: string; installs: number; views: number }) => ({ day: String(row.day), installs: Number(row.installs ?? 0), views: Number(row.views ?? 0) })));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load analytics.");
    } finally { setLoading(false); }
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => stats.reduce((a, row) => ({ views: a.views + row.views, installs: a.installs + row.installs }), { views: 0, installs: 0 }), [stats]);
  const maxValue = Math.max(1, ...stats.map((row) => Math.max(row.views, row.installs)));
  const pro = hasPaidPro(subscription);
  const averageRating = useMemo(() => {
    const count = listings.reduce((sum, item) => sum + Number(item.rating_count ?? 0), 0);
    const weighted = listings.reduce((sum, item) => sum + Number(item.rating_avg ?? 0) * Number(item.rating_count ?? 0), 0);
    return count ? weighted / count : 0;
  }, [listings]);
  const ratingCount = listings.reduce((sum, item) => sum + Number(item.rating_count ?? 0), 0);
  const published = listings.filter((item) => item.status === "published").length;

  return <ScrollView style={styles.root} contentContainerStyle={styles.content}>
    <TouchableOpacity onPress={onBack} style={styles.back}><Text style={styles.backText}>‹  Developer dashboard</Text></TouchableOpacity>
    <Text style={styles.kicker}>DEVELOPER MODE</Text>
    <Text style={styles.heading}>Analytics</Text>
    <Text style={styles.subtitle}>Product performance from your MAS developer account.</Text>
    {loading ? <ActivityIndicator color="#1A73E8" style={{ marginTop: 28 }} /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {!loading && !error && !pro ? <View style={styles.panel}>
      <Text style={styles.proTag}>DEVELOPER PRO</Text>
      <Text style={styles.panelTitle}>Advanced analytics is a Pro feature</Text>
      <Text style={styles.subtitle}>Upgrade to view performance trends, daily installs and views. Access is based on your confirmed paid subscription.</Text>
      <TouchableOpacity onPress={() => void Linking.openURL("https://malawian-app-store.vercel.app/console/subscription")} style={styles.primary}><Text style={styles.primaryText}>View Developer Pro</Text></TouchableOpacity>
    </View> : null}
    {!loading && !error && pro ? <>
      <View style={styles.ranges}>
        {([7, 30, 90] as Range[]).map((item) => <TouchableOpacity key={item} onPress={() => setRange(item)} style={[styles.range, range === item && styles.rangeActive]}><Text style={[styles.rangeText, range === item && styles.rangeTextActive]}>{item} days</Text></TouchableOpacity>)}
      </View>
      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricValue}>{number(totals.views)}</Text><Text style={styles.metricLabel}>Product views</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{number(totals.installs)}</Text><Text style={styles.metricLabel}>Installs / visits</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{totals.views ? (totals.installs / totals.views * 100).toFixed(1) + "%" : "—"}</Text><Text style={styles.metricLabel}>Conversion</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{averageRating ? averageRating.toFixed(1) : "—"}</Text><Text style={styles.metricLabel}>Average rating · {number(ratingCount)} reviews</Text></View>
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Daily performance</Text>
        <Text style={styles.subtitle}>Views and installs recorded by MAS during the selected period.</Text>
        {stats.length ? stats.map((row) => <View key={row.day} style={styles.chartRow}>
          <Text style={styles.date}>{row.day.slice(5)}</Text>
          <View style={styles.bars}>
            <View style={styles.barTrack}><View style={[styles.bar, styles.viewsBar, { width: (Math.max(row.views ? 2 : 0, row.views / maxValue * 100) + "%") as `${number}%` }]} /></View>
            <View style={styles.barTrack}><View style={[styles.bar, styles.installBar, { width: (Math.max(row.installs ? 2 : 0, row.installs / maxValue * 100) + "%") as `${number}%` }]} /></View>
          </View>
          <Text style={styles.values}>{row.views}/{row.installs}</Text>
        </View>) : <Text style={styles.empty}>No recorded events for this period.</Text>}
        <View style={styles.legend}><Text style={styles.legendViews}>■ Views</Text><Text style={styles.legendInstalls}>■ Installs / visits</Text></View>
      </View>
      <View style={styles.panel}>
        <Text style={styles.panelTitle}>Product performance</Text>
        <Text style={styles.subtitle}>{number(listings.length)} total products · {number(published)} published</Text>
        {listings.length ? listings.map((item) => <View key={item.id} style={styles.product}>
          <View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.productName}>{item.name}</Text><Text style={styles.productMeta}>{item.kind} · {item.status}</Text></View>
          <View style={styles.productStats}><Text style={styles.productValue}>{number(Number(item.downloads ?? 0))}</Text><Text style={styles.productMeta}>Lifetime</Text></View>
          <View style={styles.productStats}><Text style={styles.productValue}>{item.rating_count ? Number(item.rating_avg ?? 0).toFixed(1) : "—"}</Text><Text style={styles.productMeta}>Rating</Text></View>
        </View>) : <Text style={styles.empty}>Publish products to see product performance.</Text>}
      </View>
      <Text style={styles.footnote}>Only recorded views and install events are included. Untracked activity, revenue, retention and unique users are not estimated.</Text>
    </> : null}
    <TouchableOpacity onPress={() => void load()} style={styles.refresh}><Text style={styles.refreshText}>Refresh analytics</Text></TouchableOpacity>
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8F9FA" },
  content: { padding: 16, paddingBottom: 36 },
  back: { alignSelf: "flex-start", paddingVertical: 8, paddingRight: 12 },
  backText: { color: "#1A73E8", fontSize: 13, fontWeight: "600" },
  kicker: { color: "#1A73E8", fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 12 },
  heading: { color: "#202124", fontSize: 25, fontWeight: "700", marginTop: 4 },
  subtitle: { color: "#5F6368", fontSize: 12, lineHeight: 18, marginTop: 5 },
  error: { color: "#B3261E", backgroundColor: "#FCE8E6", padding: 12, borderRadius: 10, marginTop: 14, fontSize: 12 },
  ranges: { flexDirection: "row", gap: 8, marginTop: 18 },
  range: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 20, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DADCE0" },
  rangeActive: { backgroundColor: "#E8F0FE", borderColor: "#AECBFA" },
  rangeText: { color: "#5F6368", fontSize: 12, fontWeight: "600" },
  rangeTextActive: { color: "#174EA6" },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 14 },
  metric: { width: "48%", backgroundColor: "#FFF", borderRadius: 12, padding: 13, minHeight: 76 },
  metricValue: { color: "#202124", fontSize: 21, fontWeight: "700" },
  metricLabel: { color: "#5F6368", fontSize: 10, marginTop: 5 },
  panel: { backgroundColor: "#FFF", borderRadius: 14, padding: 14, marginTop: 14 },
  proTag: { color: "#1A73E8", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  panelTitle: { color: "#202124", fontSize: 15, fontWeight: "700" },
  chartRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 11 },
  date: { width: 43, color: "#5F6368", fontSize: 9 },
  bars: { flex: 1, gap: 4 },
  barTrack: { height: 7, backgroundColor: "#F1F3F4", borderRadius: 5, overflow: "hidden" },
  bar: { height: 7, borderRadius: 5 },
  viewsBar: { backgroundColor: "#1A73E8" },
  installBar: { backgroundColor: "#188038" },
  values: { width: 54, color: "#5F6368", fontSize: 9, textAlign: "right" },
  legend: { flexDirection: "row", gap: 16, marginTop: 14 },
  legendViews: { color: "#1A73E8", fontSize: 10 },
  legendInstalls: { color: "#188038", fontSize: 10 },
  product: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F1F3F4" },
  productName: { color: "#202124", fontSize: 12, fontWeight: "600" },
  productMeta: { color: "#80868B", fontSize: 9, marginTop: 3, textTransform: "capitalize" },
  productStats: { minWidth: 48, alignItems: "flex-end" },
  productValue: { color: "#202124", fontSize: 12, fontWeight: "700" },
  empty: { color: "#80868B", fontSize: 12, paddingVertical: 18, textAlign: "center" },
  footnote: { color: "#80868B", fontSize: 10, lineHeight: 16, marginTop: 13 },
  primary: { minHeight: 44, backgroundColor: "#1A73E8", borderRadius: 22, alignItems: "center", justifyContent: "center", marginTop: 16 },
  primaryText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  refresh: { alignItems: "center", padding: 14, marginTop: 6 },
  refreshText: { color: "#1A73E8", fontSize: 12, fontWeight: "700" },
});
