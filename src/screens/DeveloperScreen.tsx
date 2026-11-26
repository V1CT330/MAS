import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, AppState, Linking, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import NativePublishingScreen from "./NativePublishingScreen";
import NativeListingDetailScreen from "./NativeListingDetailScreen";
import NativeAnalyticsScreen from "./NativeAnalyticsScreen";
import NativeVerificationScreen from "./NativeVerificationScreen";
import NativeSubscriptionScreen from "./NativeSubscriptionScreen";
import NativeDeveloperSettingsScreen from "./NativeDeveloperSettingsScreen";
import NativeQualityScreen from "./NativeQualityScreen";
import NativeReviewsScreen from "./NativeReviewsScreen";
import NotificationsScreen from "./NotificationsScreen";

type Product = { id: string; name: string; kind: string; status: string; downloads: number | null; rating_avg: number | null; rating_count: number | null; updated_at: string; tagline: string | null; description: string | null; category: string; icon_url: string | null; screenshots: string[] | null; website_url: string | null };
type Metric = { day: string; views: number; installs: number };
type ProductStatus = "all" | "published" | "pending" | "draft" | "rejected" | "archived";

const WEB = "https://malawian-app-store.vercel.app";
const STATUS_FILTERS: ProductStatus[] = ["all", "published", "pending", "draft", "rejected", "archived"];
const displayStatus = (value: string) => value === "published" ? "Live" : value === "pending" ? "In review" : value.charAt(0).toUpperCase() + value.slice(1);
const isIncompleteDraft = (product: Product) => {
  const website = product.kind === "website";
  return product.name.trim().length < 3
    || (product.tagline?.trim().length ?? 0) < 20
    || (product.description?.trim().length ?? 0) < 200
    || !product.category
    || !product.icon_url
    || (product.screenshots?.length ?? 0) < 2
    || (website && !/^https?:\/\/.+\..+/.test(product.website_url ?? ""));
};
const LINKS = [
  { title: "Publishing", path: "/upload", description: "Create drafts and submit products for review." },
  { title: "Developer Pro", path: "/console/subscription", description: "View plan status and use secure PayChangu checkout." },
  { title: "Verification", path: "/console/verification", description: "Continue the existing identity verification process." },
  { title: "Analytics", path: "/console/analytics", description: "Open the existing developer analytics workflow." },
  { title: "Reviews", path: "/console/reviews", description: "Read product ratings and open listings to reply to customers." },
  { title: "Account settings", path: "/console/settings", description: "Manage your developer profile, security and store presence." },
  { title: "Store presence", path: "/console/store", description: "Manage the public developer page shown to MAS users." },
  { title: "Resources & support", path: "/console/resources", description: "Open MAS developer guides and support resources." },
  { title: "Developer notifications", path: "/console/notifications", description: "Review publishing, verification and account alerts." },
  { title: "Team management", path: "/console/manage", description: "Invite collaborators and manage workspace access through the secure MAS workflow." },
  { title: "Quality review", path: "/console/quality", description: "Review publishing quality guidance and listing requirements." },
];

export default function DeveloperScreen({ onExit }: { onExit: () => void }) {
  const { width: screenWidth } = useWindowDimensions();
  const dashboardWidth = Math.min(screenWidth, 1200) - 32;
  const metricColumns = screenWidth >= 900 ? 4 : screenWidth >= 600 ? 3 : 2;
  const metricGap = 12;
  const metricWidth = (dashboardWidth - metricGap * (metricColumns - 1)) / metricColumns;
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
  const [activeWorkflow, setActiveWorkflow] = useState<"dashboard" | "publishing" | "listing" | "analytics" | "verification" | "subscription" | "settings" | "notifications" | "quality" | "reviews">("dashboard");
  const [activeListingId, setActiveListingId] = useState<string | null>(null);
  const previousAppState = useRef(AppState.currentState);
  const loadGeneration = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadGeneration.current;
    setLoading(true);
    setError("");
    try {
      if (!isSupabaseConfigured) {
        setLoading(false);
        setError("Configure the public MAS Supabase client to access developer data.");
        return;
      }
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (requestId !== loadGeneration.current) return;
      if (authError || !auth.user) {
        setUserId(null);
        setProducts([]);
        setMetrics([]);
        setActiveWorkflow("dashboard");
        setActiveListingId(null);
        setSelectedProduct(null);
        setLoading(false);
        setError(authError?.message || "Sign in to access your developer workspace.");
        return;
      }
      const { data: profile, error: profileError } = await supabase.from("profiles")
        .select("display_name,developer_name,mode,kyc_status")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (requestId !== loadGeneration.current) return;
      if (profileError) {
        setError(profileError.message);
        setUserId(null);
        setProducts([]);
        setMetrics([]);
        setActiveWorkflow("dashboard");
        setActiveListingId(null);
        setSelectedProduct(null);
        setLoading(false);
        return;
      }
      // Match the WebApp guard: profiles.mode is the authoritative workspace permission.
      // Do not query developer listings or analytics until the server confirms developer mode.
      if (profile?.mode !== "developer") {
        setUserId(null);
        setProducts([]);
        setMetrics([]);
        setActiveWorkflow("dashboard");
        setActiveListingId(null);
        setSelectedProduct(null);
        setLoading(false);
        return;
      }
      setUserId(auth.user.id);
      setDeveloperName(profile.developer_name || profile.display_name || "Developer");
      setKyc(profile.kyc_status || "none");
      const [listingResult, statsResult] = await Promise.all([
        supabase.from("listings").select("id,name,kind,status,downloads,rating_avg,rating_count,updated_at,tagline,description,category,icon_url,screenshots,website_url").eq("developer_id", auth.user.id).order("updated_at", { ascending: false }),
        supabase.rpc("developer_stats", { _developer: auth.user.id, _days: 30 }),
      ]);
      if (requestId !== loadGeneration.current) return;
      if (listingResult.error) {
        setProducts([]);
        setError(listingResult.error.message);
      } else setProducts((listingResult.data ?? []) as Product[]);
      if (statsResult.error) {
        setMetrics([]);
        if (!listingResult.error) setError(statsResult.error.message);
      } else setMetrics((statsResult.data ?? []) as Metric[]);
      setLoading(false);
    } catch (error) {
      if (requestId !== loadGeneration.current) return;
      setUserId(null);
      setProducts([]);
      setMetrics([]);
      setActiveWorkflow("dashboard");
      setActiveListingId(null);
      setSelectedProduct(null);
      setError(error instanceof Error ? error.message : "Could not load developer workspace. Check your connection and try again.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Re-check server-authoritative workspace permission whenever the app resumes.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const wasInactive = previousAppState.current === "background" || previousAppState.current === "inactive";
      previousAppState.current = nextState;
      if (wasInactive && nextState === "active") {
        setUserId(null);
        setProducts([]);
        setMetrics([]);
        void load();
      }
    });
    return () => {
      subscription.remove();
      loadGeneration.current += 1;
    };
  }, [load]);

  const publishedCount = products.filter((product) => product.status === "published").length;
  const pendingCount = products.filter((product) => product.status === "pending").length;
  const draftCount = products.filter((product) => product.status === "draft").length;
  const rejectedCount = products.filter((product) => product.status === "rejected").length;
  const needsAttentionCount = products.filter((product) => product.status === "rejected" || (product.status === "draft" && isIncompleteDraft(product))).length;
  const views = metrics.reduce((sum, item) => sum + Number(item.views ?? 0), 0);
  const installs = metrics.reduce((sum, item) => sum + Number(item.installs ?? 0), 0);
  const conversion = views ? Math.round(installs * 100 / views) : 0;
  const ratedProducts = products.filter((product) => Number(product.rating_count ?? 0) > 0);
  const averageRating = ratedProducts.reduce((sum, product) => sum + Number(product.rating_avg ?? 0), 0) / Math.max(1, ratedProducts.length);
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const matchesStatus = statusFilter === "all" || product.status === statusFilter;
      const matchesQuery = !query || [product.name, product.kind, product.status].some((value) => value.toLocaleLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
  }, [products, search, statusFilter]);

  const shellHeader = (
    <View style={styles.shellHeader}>
      <View style={styles.shellHeaderCopy}>
        <Text style={styles.shellEyebrow}>MALAWIAN APP STORE</Text>
        <Text style={styles.shellTitle}>Developer console</Text>
      </View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Switch workspace" onPress={onExit} style={styles.switchSpaceButton}>
        <Text style={styles.switchSpaceText}>Switch space</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading && !userId) return <View style={styles.root}>{shellHeader}<View style={styles.loadingState}><ActivityIndicator color="#1877F2" /></View></View>;
  if (!userId) return <View style={styles.root}>{shellHeader}<View style={styles.emptyState}><Text style={styles.heading}>Developer Mode</Text><Text style={styles.body}>{error || "Activate your developer workspace in MAS account settings. Developer terms and eligibility are confirmed by the existing WebApp."}</Text><Button title="Open MAS developer settings" onPress={() => void Linking.openURL(`${WEB}/settings`)} /></View></View>;

  if (activeWorkflow === "publishing") return <View style={styles.childScreen}>{shellHeader}<View style={styles.childContent}><NativePublishingScreen onSaved={(listing) => { setActiveListingId(listing.id); setActiveWorkflow("listing"); void load(); }} /></View></View>;
  if (activeWorkflow === "analytics") return <View style={styles.childScreen}>{shellHeader}<View style={styles.childContent}><NativeAnalyticsScreen onBack={() => { setActiveWorkflow("dashboard"); void load(); }} /></View></View>;
  if (activeWorkflow === "quality") return <View style={styles.childScreen}>{shellHeader}<View style={styles.childContent}><NativeQualityScreen onBack={() => { setActiveWorkflow("dashboard"); void load(); }} onStartListing={() => setActiveWorkflow("publishing")} onSelectListing={(listingId) => { setActiveListingId(listingId); setActiveWorkflow("listing"); }} /></View></View>;
  if (activeWorkflow === "reviews") return <View style={styles.childScreen}>{shellHeader}<View style={styles.childContent}><NativeReviewsScreen onBack={() => { setActiveWorkflow("dashboard"); void load(); }} onSelectListing={(listingId) => { setActiveListingId(listingId); setActiveWorkflow("listing"); }} /></View></View>;
  if (activeWorkflow === "verification") return <View style={styles.childScreen}>{shellHeader}<View style={styles.childContent}><NativeVerificationScreen onBack={() => { setActiveWorkflow("dashboard"); void load(); }} /></View></View>;
  if (activeWorkflow === "subscription") return <View style={styles.childScreen}>{shellHeader}<View style={styles.childContent}><NativeSubscriptionScreen onBack={() => { setActiveWorkflow("dashboard"); void load(); }} /></View></View>;
  if (activeWorkflow === "settings") return <View style={styles.childScreen}>{shellHeader}<View style={styles.childContent}><NativeDeveloperSettingsScreen onBack={() => { setActiveWorkflow("dashboard"); void load(); }} /></View></View>;
  if (activeWorkflow === "notifications") return <View style={styles.childScreen}>{shellHeader}<View style={styles.childContent}><TouchableOpacity onPress={() => setActiveWorkflow("dashboard")} style={{padding:14}}><Text style={{color:"#1A73E8",fontWeight:"700"}}>‹ Developer dashboard</Text></TouchableOpacity><NotificationsScreen scope="developer" /></View></View>;
  if (activeWorkflow === "listing" && activeListingId) return <View style={styles.childScreen}>{shellHeader}<View style={styles.childContent}><NativeListingDetailScreen listingId={activeListingId} onBack={() => { setActiveWorkflow("dashboard"); void load(); }} /></View></View>;

  const actionItems = [
    ...products.filter((product) => product.status === "rejected").map((product) => ({
      key: product.id, title: product.name,
      description: "Listing rejected · review the feedback and resubmit",
      action: () => setSelectedProduct(product), tone: "warning" as const,
    })),
    ...products.filter((product) => product.status === "draft" && isIncompleteDraft(product)).map((product) => ({
      key: product.id, title: product.name,
      description: "Incomplete draft · finish the listing before submission",
      action: () => setSelectedProduct(product), tone: "info" as const,
    })),
  ];

  return <>
    {shellHeader}
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.welcome}>
        <View style={styles.welcomeCopy}>
          <Text style={styles.kicker}>DEVELOPER WORKSPACE</Text>
          <Text style={styles.heading}>Your publishing overview</Text>
          <Text style={styles.body}>Track your products, understand store performance and keep every publication moving.</Text>
          <View style={styles.identityRow}>
            <View style={styles.identityDot} />
            <Text style={styles.identityText}>{developerName}</Text>
            <View style={styles.identityDivider} />
            <Text style={styles.identityText}>KYC · {kyc}</Text>
          </View>
        </View>
        <Button title="＋ Publish a product" onPress={() => setActiveWorkflow("publishing")} />
      </View>

      <View style={styles.sectionHeadingRow}>
        <Text style={styles.section}>Publishing summary</Text>
        <Text style={styles.sectionMeta}>YOUR CATALOGUE</Text>
      </View>
      <View style={styles.metrics}>
        {[
          ["Published", publishedCount, "Live in the store", "green"],
          ["In review", pendingCount, "Awaiting moderation", "blue"],
          ["Drafts", draftCount, "Not yet submitted", "neutral"],
          ["Needs attention", needsAttentionCount, "Fix or complete", "amber"],
        ].map(([label, value, note, tone]) => <View key={String(label)} style={[styles.metric, { width: metricWidth }, tone === "green" ? styles.metricGreen : tone === "blue" ? styles.metricBlue : tone === "amber" ? styles.metricAmber : styles.metricNeutral]}>
          <Text style={styles.metricLabel}>{String(label)}</Text>
          <Text style={styles.metricValue}>{String(value)}</Text>
          <Text style={styles.metricNote}>{String(note)}</Text>
        </View>)}
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View>
            <Text style={styles.kicker}>STORE PERFORMANCE</Text>
            <Text style={styles.panelTitle}>The last 30 days</Text>
            <Text style={styles.body}>Views and installs recorded across your products.</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" onPress={() => setActiveWorkflow("analytics")} style={styles.textAction}>
            <Text style={styles.textActionLabel}>Full report ›</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.performanceGrid}>
          {[
            ["Installs", installs.toLocaleString(), "30-day total"],
            ["Store views", views.toLocaleString(), "30-day total"],
            ["Conversion", `${conversion}%`, "Views to installs"],
            ["Average rating", averageRating > 0 ? averageRating.toFixed(1) : "N/A", `${ratedProducts.reduce((sum, product) => sum + Number(product.rating_count ?? 0), 0)} ratings`],
          ].map(([label, value, note]) => <View key={label} style={styles.performanceItem}>
            <Text style={styles.performanceLabel}>{label}</Text>
            <Text style={styles.performanceValue}>{value}</Text>
            <Text style={styles.metricNote}>{note}</Text>
          </View>)}
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View><Text style={styles.kicker}>NEXT STEPS</Text><Text style={styles.panelTitle}>Needs your attention</Text></View>
          <View style={[styles.countPill, actionItems.length ? styles.countPillWarning : styles.countPillGood]}>
            <Text style={[styles.countPillText, actionItems.length ? styles.countPillWarningText : styles.countPillGoodText]}>{actionItems.length} {actionItems.length === 1 ? "item" : "items"}</Text>
          </View>
        </View>
        {actionItems.length ? actionItems.slice(0, 5).map((item) => <TouchableOpacity key={item.key} accessibilityRole="button" onPress={item.action} style={styles.actionRow}>
          <View style={[styles.actionMark, item.tone === "warning" ? styles.actionMarkWarning : styles.actionMarkInfo]} />
          <View style={styles.actionCopy}><Text style={styles.actionTitle}>{item.title}</Text><Text style={styles.body}>{item.description}</Text></View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>) : <View style={styles.allCaughtUp}>
          <Text style={styles.allCaughtUpTitle}>✓  You are all caught up</Text>
          <Text style={styles.body}>Nothing is blocked. Keep your listings complete and up to date.</Text>
        </View>}
        {kyc !== "approved" ? <TouchableOpacity accessibilityRole="button" onPress={() => setActiveWorkflow("verification")} style={styles.actionRow}>
          <View style={[styles.actionMark, styles.actionMarkInfo]} />
          <View style={styles.actionCopy}><Text style={styles.actionTitle}>Developer verification</Text><Text style={styles.body}>Current status: {kyc}. Open verification to review the next step.</Text></View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity> : null}
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <View><Text style={styles.kicker}>YOUR CATALOGUE</Text><Text style={styles.panelTitle}>Your products</Text></View>
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
          {STATUS_FILTERS.map((status) => <TouchableOpacity key={status} accessibilityRole="button" accessibilityState={{ selected: statusFilter === status }} onPress={() => setStatusFilter(status)} style={[styles.filter, statusFilter === status && styles.filterActive]}>
            <Text style={[styles.filterText, statusFilter === status && styles.filterTextActive]}>{status === "all" ? "All" : displayStatus(status)}</Text>
          </TouchableOpacity>)}
        </ScrollView>
        {loading ? <ActivityIndicator color="#1A73E8" style={styles.inlineLoader} /> : filteredProducts.length ? filteredProducts.map((product) => <TouchableOpacity key={product.id} accessibilityRole="button" onPress={() => setSelectedProduct(product)} style={styles.filteredProduct}>
          <View style={styles.productInfo}><Text numberOfLines={1} style={styles.productName}>{product.name}</Text><Text style={styles.body}>{product.kind} · {Number(product.downloads ?? 0).toLocaleString()} installs</Text></View>
          <Text style={[styles.status, product.status === "published" ? styles.statusLive : product.status === "rejected" ? styles.statusRejected : product.status === "pending" ? styles.statusPending : styles.statusNeutral]}>{displayStatus(product.status)}</Text>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>) : products.length ? <Text style={styles.body}>No products match this search or status.</Text> : <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No products yet</Text>
          <Text style={styles.body}>Publish an app, website or digital product to build your catalogue.</Text>
          <Button title="Create your first product" onPress={() => setActiveWorkflow("publishing")} />
        </View>}
        <Button title="Refresh products" onPress={() => void load()} />
      </View>

      <View style={styles.panel}>
        <Text style={styles.kicker}>WORKSPACE</Text><Text style={styles.panelTitle}>Developer tools</Text>
        {LINKS.map((item) => <TouchableOpacity key={item.path} accessibilityRole="button" onPress={() => item.path === "/upload" ? setActiveWorkflow("publishing") : item.path === "/console/analytics" ? setActiveWorkflow("analytics") : item.path === "/console/verification" ? setActiveWorkflow("verification") : item.path === "/console/subscription" ? setActiveWorkflow("subscription") : item.path === "/console/settings" ? setActiveWorkflow("settings") : item.path === "/console/notifications" ? setActiveWorkflow("notifications") : item.path === "/console/quality" ? setActiveWorkflow("quality") : item.path === "/console/reviews" ? setActiveWorkflow("reviews") : void Linking.openURL(`${WEB}${item.path}`)} style={styles.toolRow}>
          <View style={styles.toolCopy}><Text style={styles.linkTitle}>{item.title}</Text><Text style={styles.body}>{item.description}</Text></View><Text style={styles.chevron}>›</Text>
        </TouchableOpacity>)}
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </ScrollView>

    <Modal visible={Boolean(selectedProduct)} transparent animationType="slide" onRequestClose={() => setSelectedProduct(null)}>
      {selectedProduct ? <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Product overview</Text>
            <TouchableOpacity onPress={() => setSelectedProduct(null)} accessibilityRole="button" accessibilityLabel="Close product overview"><Text style={styles.close}>×</Text></TouchableOpacity>
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
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  childScreen: { flex: 1, backgroundColor: "#FFFFFF" },
  childContent: { flex: 1, minHeight: 0 },
  shellHeader: { minHeight: 62, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 9, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#E8EEF7" },
  shellHeaderCopy: { flex: 1, minWidth: 0 },
  shellEyebrow: { color: "#64748B", fontSize: 9, fontWeight: "800", letterSpacing: 1 },
  shellTitle: { color: "#172B4D", fontSize: 18, fontWeight: "800", marginTop: 2 },
  switchSpaceButton: { minHeight: 40, justifyContent: "center", paddingHorizontal: 12, borderRadius: 9, backgroundColor: "#EAF2FF" },
  switchSpaceText: { color: "#1765CC", fontSize: 12, fontWeight: "700" },
  content: { padding: 16, paddingBottom: 36, gap: 16 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center" },
  welcome: { backgroundColor: "#FFFFFF", borderRadius: 14, borderWidth: 1, borderColor: "#E5ECF5", padding: 18, gap: 14 },
  welcomeCopy: { gap: 3 },
  kicker: { color: "#5F78A0", fontSize: 11, fontWeight: "800", letterSpacing: 1.1 },
  heading: { color: "#202A3A", fontSize: 24, lineHeight: 30, fontWeight: "700", marginTop: 5 },
  body: { color: "#66758A", fontSize: 14, lineHeight: 20, marginTop: 4 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10, flexWrap: "wrap" },
  identityDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#18865B" },
  identityText: { color: "#66758A", fontSize: 12, fontWeight: "600" },
  identityDivider: { height: 12, width: 1, backgroundColor: "#DCE4EF", marginHorizontal: 2 },
  sectionHeadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  section: { color: "#27364A", fontSize: 16, fontWeight: "700" },
  sectionMeta: { color: "#8391A5", fontSize: 11, fontWeight: "800", letterSpacing: 0.9 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { minHeight: 92, justifyContent: "center", paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "transparent", borderWidth: 0, borderLeftWidth: 3, borderRadius: 0 },
  metricGreen: { borderLeftColor: "#26966D" }, metricBlue: { borderLeftColor: "#4285E8" }, metricNeutral: { borderLeftColor: "#A8B4C4" }, metricAmber: { borderLeftColor: "#D49A36" },
  metricValue: { color: "#202A3A", fontSize: 25, fontWeight: "700", marginTop: 5, fontVariant: ["tabular-nums"] },
  metricLabel: { color: "#56667C", fontSize: 13, fontWeight: "600" },
  metricNote: { color: "#748197", fontSize: 12, marginTop: 3, lineHeight: 16 },
  panel: { backgroundColor: "transparent", borderWidth: 0, borderBottomWidth: 1, borderBottomColor: "#E5ECF5", borderRadius: 0, paddingHorizontal: 0, paddingVertical: 14, gap: 12 },
  panelHeader: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  panelTitle: { color: "#27364A", fontSize: 17, fontWeight: "700", marginTop: 3 },
  count: { color: "#748197", fontSize: 11, fontWeight: "700" },
  textAction: { alignSelf: "flex-start", paddingVertical: 5 },
  textActionLabel: { color: "#1A73E8", fontSize: 11, fontWeight: "700" },
  performanceGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 16, paddingTop: 6 },
  performanceItem: { width: "50%", paddingRight: 8 },
  performanceLabel: { color: "#748197", fontSize: 13 },
  performanceValue: { color: "#263448", fontSize: 20, fontWeight: "700", marginTop: 3, fontVariant: ["tabular-nums"] },
  countPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6 },
  countPillWarning: { backgroundColor: "#FFF3DF" }, countPillGood: { backgroundColor: "#E8F5EF" },
  countPillText: { fontSize: 12, fontWeight: "700" },
  countPillWarningText: { color: "#94621A" }, countPillGoodText: { color: "#217653" },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: "#EEF2F7" },
  actionMark: { width: 8, height: 8, borderRadius: 4 },
  actionMarkWarning: { backgroundColor: "#D97757" }, actionMarkInfo: { backgroundColor: "#4285E8" },
  actionCopy: { flex: 1, minWidth: 0 }, actionTitle: { color: "#334257", fontSize: 14, fontWeight: "700" },
  allCaughtUp: { backgroundColor: "transparent", borderRadius: 0, paddingVertical: 10, paddingHorizontal: 0 },
  allCaughtUpTitle: { color: "#217653", fontSize: 12, fontWeight: "700" },
  product: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#EEF2F7" },
  productIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: "#EAF1FC", alignItems: "center", justifyContent: "center" },
  productIconText: { color: "#2767B7", fontSize: 16, fontWeight: "700" },
  productInfo: { flex: 1, minWidth: 0 }, productName: { color: "#2B394D", fontSize: 14, fontWeight: "700" },
  status: { overflow: "hidden", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5, fontSize: 11, fontWeight: "700" },
  statusLive: { color: "#217653", backgroundColor: "#E8F5EF" }, statusRejected: { color: "#A33E36", backgroundColor: "#FCEDEA" }, statusPending: { color: "#8A641E", backgroundColor: "#FFF4DF" }, statusNeutral: { color: "#64748B", backgroundColor: "#EEF2F7" },
  chevron: { color: "#8996A8", fontSize: 20 },
  emptyState: { backgroundColor: "#F7F9FC", borderRadius: 14, padding: 14 }, emptyTitle: { color: "#334257", fontSize: 15, fontWeight: "700" },
  search: { width: "100%", minHeight: 44, borderWidth: 1, borderColor: "#DCE4EF", borderRadius: 8, backgroundColor: "#FBFCFE", paddingHorizontal: 12, color: "#263448", marginTop: 5 },
  filters: { flexDirection: "row", gap: 7, paddingVertical: 8 },
  filter: { borderWidth: 1, borderColor: "#DCE4EF", borderRadius: 8, paddingHorizontal: 11, paddingVertical: 7, backgroundColor: "#FFFFFF" },
  filterActive: { backgroundColor: "#E8F0FE", borderColor: "#C8DAFA" },
  filterText: { color: "#596A80", fontSize: 12, fontWeight: "600" }, filterTextActive: { color: "#174EA6" },
  inlineLoader: { marginVertical: 14 },
  filteredProduct: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#EEF2F7" },
  button: { alignSelf: "flex-start", backgroundColor: "#1A73E8", minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 8, paddingHorizontal: 14, marginTop: 5 },
  buttonText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  toolRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: "#EEF2F7" },
  toolCopy: { flex: 1, minWidth: 0 }, linkTitle: { color: "#2869B7", fontSize: 14, fontWeight: "700" },
  error: { marginTop: 12, padding: 12, borderRadius: 8, color: "#9A3412", backgroundColor: "#FFF7ED", fontSize: 13, lineHeight: 19 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15,23,42,0.38)" },
  modalCard: { backgroundColor: "#FFFFFF", borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 20, paddingBottom: 28 },
  modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  modalTitle: { color: "#748197", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 },
  close: { color: "#748197", fontSize: 28, paddingHorizontal: 5 },
  productHeading: { color: "#202A3A", fontSize: 21, fontWeight: "700", marginTop: 12 },
  detailStatus: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 18, paddingVertical: 10, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#EEF2F7" },
  detailLabel: { color: "#748197", fontSize: 12 },
  detailGrid: { flexDirection: "row", gap: 8, marginTop: 12 },
  detailMetric: { flex: 1, backgroundColor: "#F7F9FC", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 9 },
  detailValue: { color: "#263448", fontSize: 17, fontWeight: "700" },
  cancel: { alignItems: "center", padding: 12, marginTop: 4 },
});