import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import NativePublishingScreen from "./NativePublishingScreen";
import NativeListingDetailScreen from "./NativeListingDetailScreen";
import NativeAnalyticsScreen from "./NativeAnalyticsScreen";

type Product = { id: string; name: string; kind: string; status: string; downloads: number | null; rating_avg: number | null; rating_count: number | null; updated_at: string };
type Metric = { day: string; views: number; installs: number };
type ProductStatus = "all" | "published" | "pending" | "draft" | "rejected" | "archived";

const WEB = "https://malawian-app-store-j6pm.vercel.app";
const STATUS_FILTERS: ProductStatus[] = ["all", "published", "pending", "draft", "rejected", "archived"];
const displayStatus = (value: string) => value === "published" ? "Live" : value === "pending" ? "In review" : value.charAt(0).toUpperCase() + value.slice(1);
const LINKS = [
  { title: "Publishing", path: "/upload", description: "Create drafts and submit products for review." },
  { title: "Developer Pro", path: "/console/subscription", description: "View plan status and use secure PayChangu checkout." },
  { title: "Verification", path: "/console/verification", description: "Continue the existing identity verification process." },
  { title: "Wallet & earnings", path: "/console/wallet", description: "View MAS wallet information and ledger status." },
  { title: "Analytics", path: "/console/analytics", description: "Open the existing developer analytics workflow." },
];

export default function DeveloperScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const metricWidth = screenWidth >= 1100 ? "18.5%" : screenWidth >= 640 ? "31%" : "48%";
  const [userId, setUserId] = useState<string | null>(null);
  const [developerName, setDeveloperName] = useState("Developer");
  const [kyc, setKyc] = useState("none");
  const [products, setProducts] = useState<Product[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProductStatus>("all");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeWorkflow, setActiveWorkflow] = useState<"dashboard" | "publishing" | "listing" | "analytics">("dashboard");
  const [activeListingId, setActiveListingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    if (!isSupabaseConfigured) {
      setLoading(false);
      setError("Configure the public MAS Supabase client to access developer data.");
      return;
    }
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      setUserId(null);
      setProducts([]);
      setMetrics([]);
      setLoading(false);
      if (authError) setError(authError.message);
      return;
    }
    setUserId(auth.user.id);
    const [profile, listingResult, statsResult] = await Promise.all([
      supabase.from("profiles").select("display_name,developer_name,mode,is_developer,kyc_status").eq("id", auth.user.id).maybeSingle(),
      supabase.from("listings").select("id,name,kind,status,downloads,rating_avg,rating_count,updated_at").eq("developer_id", auth.user.id).order("updated_at", { ascending: false }).limit(100),
      supabase.rpc("developer_stats", { _developer: auth.user.id, _days: 30 }),
    ]);
    if (profile.error) setError(profile.error.message);
    if (!profile.data?.is_developer && profile.data?.mode !== "developer") {
      setUserId(null);
      setLoading(false);
      return;
    }
    setDeveloperName(profile.data.developer_name || profile.data.display_name || "Developer");
    setKyc(profile.data.kyc_status || "none");
    if (listingResult.error) setError(listingResult.error.message);
    else setProducts((listingResult.data ?? []) as Product[]);
    if (statsResult.error) {
      setMetrics([]);
      if (!listingResult.error) setError(statsResult.error.message);
    } else {
      setMetrics((statsResult.data ?? []) as Metric[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const views = metrics.reduce((sum, item) => sum + Number(item.views ?? 0), 0);
  const installs = metrics.reduce((sum, item) => sum + Number(item.installs ?? 0), 0);
  const conversion = views ? Math.round(installs * 100 / views) : 0;
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const matchesStatus = statusFilter === "all" || product.status === statusFilter;
      const matchesQuery = !query || [product.name, product.kind, product.status].some((value) => value.toLocaleLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
  }, [products, search, statusFilter]);

  if (activeWorkflow === "publishing") return <NativePublishingScreen onSaved={(listing) => { setActiveListingId(listing.id); setActiveWorkflow("listing"); void load(); }} />;
  if (activeWorkflow === "analytics") return <NativeAnalyticsScreen onBack={() => { setActiveWorkflow("dashboard"); void load(); }} />;
  if (activeWorkflow === "listing" && activeListingId) return <NativeListingDetailScreen listingId={activeListingId} onBack={() => { setActiveWorkflow("dashboard"); void load(); }} />;

  if (loading && !userId) return <View style={styles.center}><ActivityIndicator color="#1877F2" /></View>;
  if (!userId) return <View style={styles.root}><View style={styles.card}><Text style={styles.heading}>Developer Mode</Text><Text style={styles.body}>{error || "Activate your developer workspace in MAS account settings. Developer terms and eligibility are confirmed by the existing WebApp."}</Text><Button title="Open MAS developer settings" onPress={() => void Linking.openURL(`${WEB}/settings`)} /></View></View>;

  return <>
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.kicker}>DEVELOPER MODE</Text>
      <Text style={styles.heading}>Welcome, {developerName}</Text>
      <Text style={styles.body}>Dashboard summary from your MAS account · KYC {kyc}</Text>
      <View style={styles.metrics}>
        {[
          ["Live products", products.filter((p) => p.status === "published").length],
          ["In review", products.filter((p) => p.status === "pending").length],
          ["Installs (30d)", installs],
          ["Views (30d)", views],
          ["Conversion", `${conversion}%`],
        ].map(([label, value]) => <View key={String(label)} style={[styles.metric, { width: metricWidth }]}><Text style={styles.metricValue}>{String(value)}</Text><Text style={styles.metricLabel}>{String(label)}</Text></View>)}
      </View>

      <View style={styles.card}>
        <View style={styles.sectionHeader}>
          <Text style={styles.section}>Your products</Text>
          <Text style={styles.count}>{filteredProducts.length} / {products.length}</Text>
        </View>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search your products"
          accessibilityLabel="Search developer products"
          returnKeyType="search"
          style={styles.search}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
          {STATUS_FILTERS.map((status) => (
            <TouchableOpacity key={status} accessibilityRole="button" accessibilityState={{ selected: statusFilter === status }} onPress={() => setStatusFilter(status)} style={[styles.filter, statusFilter === status && styles.filterActive]}>
              <Text style={[styles.filterText, statusFilter === status && styles.filterTextActive]}>{status === "all" ? "All" : displayStatus(status)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {loading ? <ActivityIndicator color="#1877F2" style={styles.inlineLoader} /> : filteredProducts.length ? filteredProducts.map((product) => (
          <TouchableOpacity key={product.id} accessibilityRole="button" onPress={() => setSelectedProduct(product)} style={styles.product}>
            <View style={styles.productInfo}>
              <Text numberOfLines={1} style={styles.productName}>{product.name}</Text>
              <Text style={styles.body}>{product.kind} · {Number(product.downloads ?? 0).toLocaleString()} installs</Text>
            </View>
            <Text style={styles.status}>{displayStatus(product.status)}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        )) : <Text style={styles.body}>{products.length ? "No products match this search or status." : "No products found on this developer account."}</Text>}
        <Button title="Refresh products" onPress={() => void load()} />
      </View>

      <Text style={styles.section}>Developer tools</Text>
      {LINKS.map((item) => <TouchableOpacity key={item.path} onPress={() => item.path === "/upload" ? setActiveWorkflow("publishing") : item.path === "/console/analytics" ? setActiveWorkflow("analytics") : void Linking.openURL(`${WEB}${item.path}`)} style={styles.linkCard}><Text style={styles.linkTitle}>{item.title} ›</Text><Text style={styles.body}>{item.description}</Text></TouchableOpacity>)}
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </ScrollView>

    <Modal visible={Boolean(selectedProduct)} transparent animationType="slide" onRequestClose={() => setSelectedProduct(null)}>
      {selectedProduct ? <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Product overview</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Close product overview" onPress={() => setSelectedProduct(null)}><Text style={styles.close}>×</Text></TouchableOpacity>
          </View>
          <Text style={styles.productHeading}>{selectedProduct.name}</Text>
          <Text style={styles.body}>{selectedProduct.kind} · Updated {selectedProduct.updated_at ? new Date(selectedProduct.updated_at).toLocaleDateString() : "date unavailable"}</Text>
          <View style={styles.detailStatus}><Text style={styles.detailLabel}>Publishing status</Text><Text style={styles.status}>{displayStatus(selectedProduct.status)}</Text></View>
          <View style={styles.detailGrid}>
            <View style={styles.detailMetric}><Text style={styles.detailValue}>{Number(selectedProduct.downloads ?? 0).toLocaleString()}</Text><Text style={styles.detailLabel}>Installs</Text></View>
            <View style={styles.detailMetric}><Text style={styles.detailValue}>{selectedProduct.rating_count ? Number(selectedProduct.rating_avg ?? 0).toFixed(1) : "—"}</Text><Text style={styles.detailLabel}>Average rating</Text></View>
            <View style={styles.detailMetric}><Text style={styles.detailValue}>{Number(selectedProduct.rating_count ?? 0).toLocaleString()}</Text><Text style={styles.detailLabel}>Reviews</Text></View>
          </View>
          <Text style={styles.body}>Manage listing details, media, releases and developer replies directly in this native workflow. MAS review decisions remain server controlled.</Text>
          <Button title="Open listing management" onPress={() => { setActiveListingId(selectedProduct.id); setSelectedProduct(null); setActiveWorkflow("listing"); }} />
          <TouchableOpacity onPress={() => setSelectedProduct(null)} style={styles.cancel}><Text style={styles.linkTitle}>Close</Text></TouchableOpacity>
        </View>
      </View> : null}
    </Modal>
  </>;
}

function Button({ title, onPress }: { title: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" onPress={onPress} style={styles.button}><Text style={styles.buttonText}>{title}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F6F7FB" },
  content: { padding: 16, paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  kicker: { color: "#1877F2", fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  heading: { color: "#111827", fontSize: 23, fontWeight: "800", marginTop: 4 },
  body: { color: "#64748B", fontSize: 12, lineHeight: 18, marginTop: 5 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  metric: { minHeight: 68, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E7EBF3", borderRadius: 11, padding: 10 },
  metricValue: { color: "#111827", fontSize: 17, fontWeight: "800" },
  metricLabel: { color: "#64748B", fontSize: 10, marginTop: 4 },
  card: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E7EBF3", borderRadius: 13, padding: 14, marginTop: 12 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  section: { color: "#111827", fontSize: 16, fontWeight: "800", marginTop: 14, marginBottom: 8 },
  count: { color: "#64748B", fontSize: 11, fontWeight: "700" },
  search: { minHeight: 42, borderWidth: 1, borderColor: "#DCE2EA", borderRadius: 9, paddingHorizontal: 11, color: "#111827", marginTop: 6 },
  filters: { flexDirection: "row", gap: 7, paddingVertical: 10 },
  filter: { borderWidth: 1, borderColor: "#DCE2EA", borderRadius: 18, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: "#FFF" },
  filterActive: { backgroundColor: "#1877F2", borderColor: "#1877F2" },
  filterText: { color: "#52607A", fontSize: 11, fontWeight: "600" },
  filterTextActive: { color: "#FFF" },
  inlineLoader: { marginVertical: 14 },
  product: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#EEF0F5" },
  productInfo: { flex: 1, minWidth: 0 },
  productName: { color: "#111827", fontSize: 13, fontWeight: "700" },
  status: { color: "#35506F", backgroundColor: "#EFF4FA", paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, overflow: "hidden", fontSize: 10, fontWeight: "700" },
  chevron: { color: "#64748B", fontSize: 20 },
  button: { backgroundColor: "#1877F2", minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 9, marginTop: 12 },
  buttonText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  linkCard: { backgroundColor: "#FFF", padding: 13, borderRadius: 11, borderWidth: 1, borderColor: "#E7EBF3", marginTop: 8 },
  linkTitle: { color: "#1877F2", fontSize: 13, fontWeight: "700" },
  error: { marginTop: 12, padding: 10, borderRadius: 8, color: "#9A3412", backgroundColor: "#FFF7ED", fontSize: 12 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.35)" },
  modalCard: { backgroundColor: "#FFF", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 28 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: "#64748B", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.7 },
  close: { color: "#64748B", fontSize: 28, paddingHorizontal: 5 },
  productHeading: { color: "#111827", fontSize: 21, fontWeight: "800", marginTop: 12 },
  detailStatus: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#EEF0F5" },
  detailLabel: { color: "#64748B", fontSize: 11 },
  detailGrid: { flexDirection: "row", gap: 8, marginTop: 12 },
  detailMetric: { flex: 1, backgroundColor: "#F6F7FB", borderRadius: 10, padding: 11 },
  detailValue: { color: "#111827", fontSize: 17, fontWeight: "800" },
  cancel: { alignItems: "center", padding: 12, marginTop: 4 },
});
