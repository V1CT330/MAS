import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type Product = { id: string; name: string; kind: string; status: string; downloads: number | null; rating_avg: number | null; rating_count: number | null; updated_at: string };
type Metric = { day: string; views: number; installs: number };
const WEB = "https://malawian-app-store-j6pm.vercel.app";
const LINKS = [
  { title: "Publishing", path: "/upload", description: "Create drafts and submit products for review." },
  { title: "Product management", path: "/console/products", description: "Edit listings, media, releases, and reviews." },
  { title: "Developer Pro", path: "/console/subscription", description: "View plan status and use secure PayChangu checkout." },
  { title: "Verification", path: "/console/verification", description: "Continue the existing identity verification process." },
  { title: "Wallet & earnings", path: "/console/wallet", description: "View MAS wallet information and ledger status." },
  { title: "Analytics", path: "/console/analytics", description: "Open the existing developer analytics workflow." },
];
export default function DeveloperScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [developerName, setDeveloperName] = useState("Developer");
  const [kyc, setKyc] = useState("none");
  const [products, setProducts] = useState<Product[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    if (!isSupabaseConfigured) { setLoading(false); setError("Configure the public MAS Supabase client to access developer data."); return; }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setUserId(null); setLoading(false); return; }
    setUserId(auth.user.id);
    const [profile, listingResult, statsResult] = await Promise.all([
      supabase.from("profiles").select("display_name,developer_name,mode,is_developer,kyc_status").eq("id", auth.user.id).maybeSingle(),
      supabase.from("listings").select("id,name,kind,status,downloads,rating_avg,rating_count,updated_at").eq("developer_id", auth.user.id).order("updated_at", { ascending: false }).limit(100),
      supabase.rpc("developer_stats", { _developer: auth.user.id, _days: 30 }),
    ]);
    if (profile.error) setError(profile.error.message);
    if (!profile.data?.is_developer && profile.data?.mode !== "developer") { setUserId(null); setLoading(false); return; }
    setDeveloperName(profile.data.developer_name || profile.data.display_name || "Developer"); setKyc(profile.data.kyc_status || "none");
    if (listingResult.error) setError(listingResult.error.message); else setProducts((listingResult.data ?? []) as Product[]);
    if (statsResult.error) setMetrics([]); else setMetrics((statsResult.data ?? []) as Metric[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const views = metrics.reduce((sum, item) => sum + Number(item.views ?? 0), 0);
  const installs = metrics.reduce((sum, item) => sum + Number(item.installs ?? 0), 0);
  const conversion = views ? Math.round(installs * 100 / views) : 0;
  if (loading) return <View style={styles.center}><ActivityIndicator color="#1877F2" /></View>;
  if (!userId) return <View style={styles.root}><View style={styles.card}><Text style={styles.heading}>Developer Mode</Text><Text style={styles.body}>{error || "Activate your developer workspace in MAS account settings. Developer terms and eligibility are confirmed by the existing WebApp."}</Text><Button title="Open MAS developer settings" onPress={() => void Linking.openURL(`${WEB}/settings`)} /></View></View>;
  return <ScrollView style={styles.root} contentContainerStyle={styles.content}>
    <Text style={styles.kicker}>DEVELOPER MODE</Text><Text style={styles.heading}>Welcome, {developerName}</Text><Text style={styles.body}>Dashboard summary from your MAS account · KYC {kyc}</Text>
    <View style={styles.metrics}>{[["Live products", products.filter((p) => p.status === "published").length], ["In review", products.filter((p) => p.status === "pending").length], ["Installs (30d)", installs], ["Views (30d)", views], ["Conversion", `${conversion}%`]].map(([label, value]) => <View key={String(label)} style={styles.metric}><Text style={styles.metricValue}>{String(value)}</Text><Text style={styles.metricLabel}>{String(label)}</Text></View>)}</View>
    <View style={styles.card}><Text style={styles.section}>Your products</Text>{products.length ? products.slice(0, 8).map((product) => <View key={product.id} style={styles.product}><View style={{ flex: 1 }}><Text style={styles.productName}>{product.name}</Text><Text style={styles.body}>{product.kind} · {Number(product.downloads ?? 0).toLocaleString()} installs</Text></View><Text style={styles.status}>{product.status}</Text></View>) : <Text style={styles.body}>No products found on this developer account.</Text>}<Button title="Manage products on MAS" onPress={() => void Linking.openURL(`${WEB}/console/products`)} /></View>
    <Text style={styles.section}>Developer tools</Text>{LINKS.map((item) => <TouchableOpacity key={item.path} onPress={() => void Linking.openURL(`${WEB}${item.path}`)} style={styles.linkCard}><Text style={styles.linkTitle}>{item.title} ›</Text><Text style={styles.body}>{item.description}</Text></TouchableOpacity>)}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}<TouchableOpacity onPress={() => void load()} style={styles.refresh}><Text style={styles.linkTitle}>Refresh dashboard</Text></TouchableOpacity>
  </ScrollView>;
}
function Button({ title, onPress }: { title: string; onPress: () => void }) { return <TouchableOpacity onPress={onPress} style={styles.button}><Text style={styles.buttonText}>{title}</Text></TouchableOpacity>; }
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#F6F7FB" }, content: { padding: 16, paddingBottom: 32 }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, kicker: { color: "#1877F2", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 }, heading: { color: "#111827", fontSize: 23, fontWeight: "800", marginTop: 4 }, body: { color: "#64748B", fontSize: 12, lineHeight: 18, marginTop: 5 }, metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 }, metric: { width: "31%", minHeight: 68, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E7EBF3", borderRadius: 11, padding: 10 }, metricValue: { color: "#111827", fontSize: 17, fontWeight: "800" }, metricLabel: { color: "#64748B", fontSize: 10, marginTop: 4 }, card: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E7EBF3", borderRadius: 13, padding: 14, marginTop: 12 }, section: { color: "#111827", fontSize: 16, fontWeight: "800", marginTop: 14, marginBottom: 8 }, product: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#EEF0F5" }, productName: { color: "#111827", fontSize: 13, fontWeight: "700" }, status: { color: "#35506F", backgroundColor: "#EFF4FA", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, fontSize: 10 }, button: { backgroundColor: "#1877F2", minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 9, marginTop: 12 }, buttonText: { color: "#FFF", fontSize: 12, fontWeight: "700" }, linkCard: { backgroundColor: "#FFF", padding: 13, borderRadius: 11, borderWidth: 1, borderColor: "#E7EBF3", marginTop: 8 }, linkTitle: { color: "#1877F2", fontSize: 13, fontWeight: "700" }, error: { marginTop: 12, padding: 10, borderRadius: 8, color: "#9A3412", backgroundColor: "#FFF7ED", fontSize: 12 }, refresh: { alignItems: "center", padding: 14 } });
