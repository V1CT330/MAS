import React, { useEffect, useMemo, useState } from "react";
import { StatusBar } from "expo-status-bar";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { isSupabaseConfigured, supabase } from "./src/lib/supabase";

const WEB_ORIGIN = "https://malawian-app-store-j6pm.vercel.app";
const ACCENT = "#1877F2";

type Mode = "user" | "developer" | "social";
type Listing = {
  id: string;
  name: string;
  kind: string;
  status: string;
  downloads: number | null;
  rating_avg: number | null;
  rating_count: number | null;
  updated_at?: string;
};
type ConsoleRoute = {
  label: string;
  path: string;
  icon: string;
};
type StatsRow = { day: string; views: number; installs: number };

const CONSOLE_ROUTES: ConsoleRoute[] = [
  { label: "Dashboard", path: "/console", icon: "▦" },
  { label: "Social", path: "/console/social", icon: "◉" },
  { label: "Wallet & earnings", path: "/console/wallet", icon: "◈" },
  { label: "All products", path: "/console/products", icon: "▣" },
  { label: "Publishing", path: "/console/publishing", icon: "↑" },
  { label: "Testing", path: "/console/testing", icon: "◇" },
  { label: "Quality", path: "/console/quality", icon: "✓" },
  { label: "Analytics", path: "/console/analytics", icon: "⌁" },
  { label: "Reviews", path: "/console/reviews", icon: "☆" },
  { label: "Advertise", path: "/advertise", icon: "↗" },
  { label: "Spotlight", path: "/spotlight", icon: "✦" },
  { label: "Developer profile", path: "/console/store", icon: "◎" },
  { label: "Manage", path: "/console/manage", icon: "⚙" },
  { label: "Settings", path: "/console/settings", icon: "☷" },
];

const listingFilters = ["all", "published", "pending", "draft", "rejected", "archived"];
const displayStatus = (value: string) => value === "published" ? "Live" : value === "pending" ? "In review" : value.charAt(0).toUpperCase() + value.slice(1);

export default function App() {
  const [mode, setMode] = useState<Mode>("user");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeRoute, setActiveRoute] = useState("/console");
  const [listings, setListings] = useState<Listing[]>([]);
  const [stats, setStats] = useState<StatsRow[]>([]);
  const [walletStatus, setWalletStatus] = useState("Setup pending");
  const [phone, setPhone] = useState("");
  const [kycStatus, setKycStatus] = useState("none");
  const [loading, setLoading] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [notice, setNotice] = useState("AI is intentionally not included in this APK.");

  const title = useMemo(() => CONSOLE_ROUTES.find((route) => route.path === activeRoute)?.label ?? "Developer console", [activeRoute]);
  const filteredListings = useMemo(() => listings.filter((item) =>
    (filter === "all" || item.status === filter) && item.name.toLowerCase().includes(search.trim().toLowerCase()),
  ), [filter, listings, search]);
  const installs30d = stats.reduce((sum, item) => sum + item.installs, 0);
  const views30d = stats.reduce((sum, item) => sum + item.views, 0);
  const conversion = views30d > 0 ? Math.round((installs30d / views30d) * 100) : 0;
  const liveListings = listings.filter((item) => item.status === "published").length;
  const pendingListings = listings.filter((item) => item.status === "pending").length;
  const draftListings = listings.filter((item) => item.status === "draft").length;
  const rejectedListings = listings.filter((item) => item.status === "rejected").length;

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    const applySession = async (session: any) => {
      if (!mounted) return;
      const user = session?.user ?? null;
      setUserEmail(user?.email ?? null);
      if (!user) {
        setProfile(null);
        setIsAdmin(false);
        return;
      }
      const [profileResult, roleResult] = await Promise.all([
        supabase.from("profiles").select("id,display_name,developer_name,mode,kyc_status,phone,avatar_url").eq("id", user.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle(),
      ]);
      if (!mounted) return;
      setProfile(profileResult.data ?? null);
      setPhone(profileResult.data?.phone ?? "");
      setKycStatus(profileResult.data?.kyc_status ?? "none");
      setIsAdmin(Boolean(roleResult.data));
      if (profileResult.error) setNotice(profileResult.error.message);
    };
    void supabase.auth.getSession().then(({ data }) => applySession(data.session));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => { void applySession(session); });
    const handleUrl = async (url: string) => {
      try {
        const callback = new URL(url);
        if (callback.protocol !== "mw.wealthgrid.mas:") return;
        const errorMessage = callback.searchParams.get("error_description") || callback.searchParams.get("error");
        if (errorMessage) throw new Error(errorMessage);
        const code = callback.searchParams.get("code");
        if (!code) throw new Error("Sign-in did not return an authorization code.");
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        setMode("user");
        setNotice("Signed in to MAS.");
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Could not complete sign-in.");
      } finally {
        setAuthLoading(false);
      }
    };
    const urlSub = Linking.addEventListener("url", ({ url }) => { void handleUrl(url); });
    void Linking.getInitialURL().then((url) => { if (url) return handleUrl(url); }).catch(() => undefined);
    return () => { mounted = false; authListener.subscription.unsubscribe(); urlSub.remove(); };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !userEmail || mode !== "developer") return;
    let mounted = true;
    const loadDeveloperData = async () => {
      setLoading(true);
      const userResult = await supabase.auth.getUser();
      const user = userResult.data.user;
      if (userResult.error || !user) {
        if (mounted) { setLoading(false); setNotice("Sign in to access the developer console."); }
        return;
      }
      const [listingResult, statsResult, profileResult] = await Promise.all([
        supabase.from("listings").select("id,name,kind,status,downloads,rating_avg,rating_count,updated_at").eq("developer_id", user.id).order("updated_at", { ascending: false }).limit(100),
        supabase.rpc("developer_stats", { _developer: user.id, _days: 30 }),
        supabase.from("profiles").select("phone,kyc_status").eq("id", user.id).maybeSingle(),
      ]);
      if (!mounted) return;
      if (listingResult.error) setNotice(listingResult.error.message);
      else setListings((listingResult.data ?? []) as Listing[]);
      if (statsResult.error) setStats([]);
      else setStats((statsResult.data ?? []).map((row: any) => ({ day: String(row.day), views: Number(row.views ?? 0), installs: Number(row.installs ?? 0) })));
      if (!profileResult.error && profileResult.data) {
        setPhone(profileResult.data.phone ?? "");
        setKycStatus(profileResult.data.kyc_status ?? "none");
      }
      setLoading(false);
    };
    void loadDeveloperData().catch((error) => { if (mounted) { setLoading(false); setNotice(error instanceof Error ? error.message : "Could not load developer data."); } });
    return () => { mounted = false; };
  }, [mode, userEmail]);

  const openWebRoute = async (path: string) => {
    const url = `${WEB_ORIGIN}${path}`;
    try {
      await Linking.openURL(url);
    } catch {
      setNotice("Could not open the MAS web workflow. Check your connection and try again.");
    }
  };

  const openRoute = (route: ConsoleRoute) => {
    setSidebarOpen(false);
    setActiveRoute(route.path);
    if (route.path === "/console") return;
    if (route.path === "/console/products") return;
    if (route.path === "/console/wallet") return;
    if (route.path === "/console/verification") return;
    if (route.path === "/console/settings") return;
    void openWebRoute(route.path);
  };

  const signIn = async () => {
    if (!isSupabaseConfigured) { setNotice("Preview build has no public MAS Supabase configuration."); return; }
    setAuthLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: "mw.wealthgrid.mas://auth/callback", skipBrowserRedirect: true },
    });
    if (error) { setAuthLoading(false); setNotice(error.message); return; }
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session) {
      setNotice("Starting Google sign-in… If the browser did not open, retry or use the MAS website.");
      setAuthLoading(false);
      return;
    }
    setAuthLoading(false);
  };

  const savePhone = async () => {
    const normalized = phone.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) { setNotice("Enter a valid international number, for example +265991234567."); return; }
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) { setNotice("Sign in to save your contact number."); return; }
    setLoading(true);
    const result = await supabase.from("profiles").update({ phone: normalized }).eq("id", data.user.id);
    setLoading(false);
    setNotice(result.error ? result.error.message : "Contact number saved.");
  };

  const openDidit = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) { setNotice("Your session has expired. Sign in again."); return; }
    setLoading(true);
    try {
      const response = await fetch(`${WEB_ORIGIN}/api/public/didit/session`, {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok || !result.url) throw new Error(result.error || "Could not start identity verification.");
      const url = new URL(result.url);
      if (url.protocol !== "https:" || !(url.hostname === "verify.didit.me" || url.hostname.endsWith(".didit.me"))) throw new Error("The verification service returned an unexpected link.");
      await Linking.openURL(url.toString());
      setNotice("Complete the secure verification flow, then return and refresh your status.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not start identity verification.");
    } finally { setLoading(false); }
  };

  const renderDeveloperContent = () => {
    if (activeRoute === "/console") {
      return <>
        <View style={styles.heroCard}>
          <Text style={styles.eyebrow}>DEVELOPER OVERVIEW</Text>
          <Text style={styles.heading}>Welcome, {profile?.developer_name || profile?.display_name || "developer"}</Text>
          <Text style={styles.bodyText}>A live summary of products, activity and publishing health. AI is not included in this APK.</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => openRoute(CONSOLE_ROUTES.find((item) => item.path === "/console/products")!)}><Text style={styles.primaryButtonText}>Manage products</Text></TouchableOpacity>
        </View>
        <View style={styles.metricGrid}>
          {[["Live products", liveListings], ["In review", pendingListings], ["Drafts", draftListings], ["Action needed", rejectedListings], ["Installs (30d)", installs30d], ["Views (30d)", views30d], ["Conversion", `${conversion}%`], ["Verification", displayStatus(kycStatus)]].map(([label, value]) => (
            <View style={styles.metricCard} key={String(label)}><Text style={styles.metricValue}>{String(value)}</Text><Text style={styles.metricLabel}>{String(label)}</Text></View>
          ))}
        </View>
        <View style={styles.panel}>
          <Text style={styles.sectionTitle}>Publishing health</Text>
          {loading ? <ActivityIndicator color={ACCENT} /> : listings.length ? listings.slice(0, 5).map((listing) => (
            <View key={listing.id} style={styles.listRow}><View style={styles.flexOne}><Text style={styles.rowTitle}>{listing.name}</Text><Text style={styles.muted}>{listing.kind} · {Number(listing.downloads ?? 0).toLocaleString()} downloads</Text></View><Text style={styles.statusPill}>{displayStatus(listing.status)}</Text></View>
          )) : <Text style={styles.muted}>No products found on your developer account.</Text>}
        </View>
        <View style={styles.panel}><Text style={styles.sectionTitle}>Needs attention</Text>{rejectedListings ? <Text style={styles.bodyText}>{rejectedListings} rejected product(s) need changes before resubmission.</Text> : draftListings ? <Text style={styles.bodyText}>{draftListings} draft(s) may need completion.</Text> : <Text style={styles.bodyText}>You are all caught up. Keep your listings current.</Text>}</View>
      </>;
    }
    if (activeRoute === "/console/products") {
      return <>
        <View style={styles.panel}>
          <TextInput value={search} onChangeText={setSearch} placeholder="Search your products" style={styles.input} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>{listingFilters.map((item) => <TouchableOpacity key={item} onPress={() => setFilter(item)} style={[styles.chip, filter === item && styles.chipActive]}><Text style={[styles.chipText, filter === item && styles.chipTextActive]}>{item === "all" ? "All" : displayStatus(item)}</Text></TouchableOpacity>)}</ScrollView>
        </View>
        <View style={styles.panel}><Text style={styles.sectionTitle}>Your products</Text>{loading ? <ActivityIndicator color={ACCENT} /> : filteredListings.map((item) => <View key={item.id} style={styles.listRow}><View style={styles.flexOne}><Text style={styles.rowTitle}>{item.name}</Text><Text style={styles.muted}>{item.kind} · {Number(item.downloads ?? 0).toLocaleString()} downloads · {item.rating_count ? Number(item.rating_avg ?? 0).toFixed(1) + " stars" : "No ratings yet"}</Text></View><Text style={styles.statusPill}>{displayStatus(item.status)}</Text></View>)}{!loading && !filteredListings.length ? <Text style={styles.muted}>No products match this filter.</Text> : null}<TouchableOpacity style={styles.secondaryButton} onPress={() => void openWebRoute("/upload")}><Text style={styles.secondaryButtonText}>Create or edit a product on MAS</Text></TouchableOpacity></View>
      </>;
    }
    if (activeRoute === "/console/wallet") {
      return <View style={styles.panel}><Text style={styles.sectionTitle}>Wallet & earnings</Text><Text style={styles.statusPill}>{walletStatus}</Text><Text style={styles.bodyText}>The WebApp reports that the earnings ledger is not connected. No balance or transaction data is fabricated here, and withdrawals are not enabled.</Text><Text style={styles.muted}>Developer Pro checkout, marketplace payments, refunds, and payouts require server-confirmed ledger records.</Text><TouchableOpacity style={styles.secondaryButton} onPress={() => void openWebRoute("/console/wallet")}><Text style={styles.secondaryButtonText}>Open full wallet information</Text></TouchableOpacity></View>;
    }
    if (activeRoute === "/console/verification") {
      return <View style={styles.panel}><Text style={styles.sectionTitle}>Developer verification</Text><Text style={styles.muted}>Status: {displayStatus(kycStatus)}</Text><Text style={styles.fieldLabel}>WhatsApp contact number</Text><TextInput value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+265991234567" style={styles.input} /><TouchableOpacity style={styles.primaryButton} disabled={loading} onPress={() => void savePhone()}><Text style={styles.primaryButtonText}>{loading ? "Saving…" : "Save contact number"}</Text></TouchableOpacity><Text style={styles.bodyText}>A phone number is contact information, not identity verification. Manual ID upload is unavailable in this native build. Verification status changes only when MAS confirms the result.</Text><TouchableOpacity style={styles.secondaryButton} disabled={loading} onPress={() => void openDidit()}><Text style={styles.secondaryButtonText}>Continue with secure Didit</Text></TouchableOpacity><TouchableOpacity style={styles.secondaryButton} onPress={() => void openWebRoute("/console/verification")}><Text style={styles.secondaryButtonText}>Open verification details</Text></TouchableOpacity></View>;
    }
    if (activeRoute === "/console/settings") {
      return <View style={styles.panel}><Text style={styles.sectionTitle}>Developer settings</Text><Text style={styles.bodyText}>Account, security and subscription changes stay in the existing authenticated MAS workflows.</Text>{["/console/settings", "/console/subscription", "/console/security", "/console/resources"].map((path) => <TouchableOpacity key={path} style={styles.listRow} onPress={() => void openWebRoute(path)}><Text style={styles.rowTitle}>{path.replace("/console/", "").replace("/", "") || "Console settings"}</Text><Text style={styles.secondaryButtonText}>Open ›</Text></TouchableOpacity>)}</View>;
    }
    return <View style={styles.panel}><Text style={styles.sectionTitle}>{title}</Text><Text style={styles.bodyText}>This feature uses the existing MAS authenticated web workflow. Your account permissions and backend validation remain in force.</Text><TouchableOpacity style={styles.primaryButton} onPress={() => void openWebRoute(activeRoute)}><Text style={styles.primaryButtonText}>Open {title} on MAS</Text></TouchableOpacity></View>;
  };

  const renderContent = () => {
    if (mode === "developer") return renderDeveloperContent();
    if (mode === "social") return <View style={styles.panel}><Text style={styles.sectionTitle}>MAS Social</Text><Text style={styles.bodyText}>Social is a community feed with profiles, friend requests, private messages, notifications, search, reactions and comments. Open the existing authenticated Social workflow to use live features.</Text><TouchableOpacity style={styles.primaryButton} onPress={() => void openWebRoute("/console/social")}><Text style={styles.primaryButtonText}>Open MAS Social</Text></TouchableOpacity></View>;
    if (mode === "user") return <View style={styles.panel}><Text style={styles.sectionTitle}>Malawian App Store</Text><Text style={styles.bodyText}>Browse live apps and websites, sign in, and manage your library through the existing MAS store.</Text><TouchableOpacity style={styles.primaryButton} onPress={() => void openWebRoute("/")}><Text style={styles.primaryButtonText}>Open MAS App Store</Text></TouchableOpacity><TouchableOpacity style={styles.secondaryButton} disabled={authLoading} onPress={() => void signIn()}><Text style={styles.secondaryButtonText}>{authLoading ? "Starting sign-in…" : userEmail || "Continue with Google"}</Text></TouchableOpacity></View>;
    return null;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <NativeStatusBar barStyle="dark-content" backgroundColor="#F6F7FB" />
      <View style={styles.container}>
        <View style={styles.topBar}><View><Text style={styles.overline}>Malawian App Store</Text><Text style={styles.title}>{mode === "developer" ? "Developer console" : mode === "social" ? "Social" : "MAS storefront"}</Text></View><Text style={styles.liveBadge}>{isSupabaseConfigured ? "Live" : "Preview"}</Text></View>
        <View style={styles.modeRow}>{(["user", "developer", "social"] as Mode[]).map((item) => <TouchableOpacity key={item} style={[styles.modeButton, mode === item && styles.modeButtonActive]} onPress={() => { setMode(item); setSidebarOpen(false); }}><Text style={[styles.modeButtonText, mode === item && styles.modeButtonTextActive]}>{item === "user" ? "User" : item === "developer" ? "Developer" : "Social"}</Text></TouchableOpacity>)}</View>
        {mode === "developer" ? <View style={styles.consoleHeader}><TouchableOpacity onPress={() => setSidebarOpen(true)} style={styles.menuButton}><Text style={styles.menuGlyph}>☰</Text></TouchableOpacity><View style={styles.flexOne}><Text style={styles.consoleTitle}>{title}</Text><Text style={styles.muted}>{profile?.developer_name || profile?.display_name || userEmail || "Developer account"} · KYC {kycStatus}</Text></View><TouchableOpacity onPress={() => void openWebRoute("/notifications")}><Text style={styles.notificationGlyph}>♧</Text></TouchableOpacity></View> : null}
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>{renderContent()}<View style={styles.statusBanner}><Text style={styles.statusText}>{notice}</Text></View></ScrollView>
        <Modal visible={sidebarOpen} transparent animationType="slide" onRequestClose={() => setSidebarOpen(false)}>
          <View style={styles.drawerRoot}><View style={styles.drawerPanel}><View style={styles.drawerHeader}><Text style={styles.drawerBrand}>Developer · MAS</Text><TouchableOpacity accessibilityLabel="Close developer menu" onPress={() => setSidebarOpen(false)}><Text style={styles.closeGlyph}>×</Text></TouchableOpacity></View><ScrollView contentContainerStyle={styles.drawerLinks}>{CONSOLE_ROUTES.map((route) => <TouchableOpacity key={route.path} style={[styles.drawerItem, activeRoute === route.path && styles.drawerItemActive]} onPress={() => openRoute(route)}><Text style={styles.drawerIcon}>{route.icon}</Text><Text style={[styles.drawerLabel, activeRoute === route.path && styles.drawerLabelActive]}>{route.label}</Text></TouchableOpacity>)}<View style={styles.drawerSeparator} /><TouchableOpacity style={styles.drawerItem} onPress={() => openRoute({ label: "Help and resources", path: "/console/resources", icon: "?" })}><Text style={styles.drawerIcon}>?</Text><Text style={styles.drawerLabel}>Help and resources</Text></TouchableOpacity>{isAdmin ? <TouchableOpacity style={styles.drawerItem} onPress={() => openRoute({ label: "Administration dashboard", path: "/admin", icon: "盾" })}><Text style={styles.drawerIcon}>盾</Text><Text style={styles.drawerLabel}>Administration dashboard</Text></TouchableOpacity> : null}<TouchableOpacity style={styles.drawerItem} onPress={() => { setSidebarOpen(false); setMode("user"); }}><Text style={styles.drawerIcon}>←</Text><Text style={styles.drawerLabel}>Switch to user mode</Text></TouchableOpacity></ScrollView><Text style={styles.drawerFootnote}>AI assistant intentionally omitted from the APK.</Text></View><TouchableOpacity style={styles.drawerScrim} onPress={() => setSidebarOpen(false)} /></View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F6F7FB" },
  container: { flex: 1, paddingHorizontal: 16, paddingTop: Platform.OS === "android" ? 8 : 4 },
  topBar: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  overline: { fontSize: 11, letterSpacing: 0.8, color: "#5E6B85", textTransform: "uppercase", fontWeight: "700" },
  title: { fontSize: 24, fontWeight: "800", color: "#111827", marginTop: 2 },
  liveBadge: { fontSize: 12, fontWeight: "700", color: "#0F766E", backgroundColor: "#D1FAE5", borderRadius: 999, overflow: "hidden", paddingHorizontal: 10, paddingVertical: 6 },
  modeRow: { flexDirection: "row", backgroundColor: "#EDF2FF", borderRadius: 14, padding: 5, marginBottom: 10 },
  modeButton: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10 },
  modeButtonActive: { backgroundColor: "#FFF", elevation: 2 },
  modeButtonText: { fontSize: 13, fontWeight: "700", color: "#52607A" },
  modeButtonTextActive: { color: "#111827" },
  consoleHeader: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  menuButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: "#FFF", borderRadius: 12, borderWidth: 1, borderColor: "#E7EBF3" },
  menuGlyph: { color: "#111827", fontSize: 20 },
  consoleTitle: { fontSize: 17, fontWeight: "800", color: "#111827" },
  notificationGlyph: { color: ACCENT, fontSize: 24, paddingHorizontal: 8 },
  content: { paddingBottom: 30 },
  heroCard: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E7EBF3", borderRadius: 16, padding: 16, marginBottom: 12 },
  eyebrow: { fontSize: 10, fontWeight: "800", letterSpacing: 1.1, color: ACCENT, marginBottom: 7 },
  heading: { fontSize: 21, fontWeight: "800", color: "#111827" },
  bodyText: { color: "#374151", fontSize: 13, lineHeight: 19, marginTop: 8 },
  metricGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 4 },
  metricCard: { width: "48.5%", backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E7EBF3", borderRadius: 14, padding: 13, marginBottom: 9 },
  metricValue: { fontSize: 19, fontWeight: "800", color: "#111827" },
  metricLabel: { fontSize: 11, color: "#64748B", marginTop: 4 },
  panel: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E7EBF3", borderRadius: 14, padding: 15, marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: "#111827", marginBottom: 10 },
  listRow: { flexDirection: "row", alignItems: "center", paddingVertical: 11, borderTopWidth: 1, borderTopColor: "#EEF0F5", gap: 8 },
  flexOne: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  muted: { color: "#64748B", fontSize: 12, marginTop: 3 },
  statusPill: { color: "#35506F", backgroundColor: "#EFF4FA", borderRadius: 100, paddingHorizontal: 9, paddingVertical: 5, fontSize: 10, fontWeight: "700", overflow: "hidden" },
  input: { minHeight: 44, borderWidth: 1, borderColor: "#DCE2EA", backgroundColor: "#FFF", borderRadius: 10, paddingHorizontal: 12, color: "#111827", marginBottom: 10 },
  chipRow: { flexDirection: "row", alignItems: "center", paddingBottom: 3 },
  chip: { borderWidth: 1, borderColor: "#DCE2EA", borderRadius: 100, paddingVertical: 7, paddingHorizontal: 10, marginRight: 7 },
  chipActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { color: "#52607A", fontSize: 11, fontWeight: "600" },
  chipTextActive: { color: "#FFF" },
  fieldLabel: { color: "#344054", fontSize: 12, fontWeight: "700", marginTop: 12, marginBottom: 6 },
  primaryButton: { minHeight: 44, borderRadius: 10, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, marginTop: 12 },
  primaryButtonText: { color: "#FFF", fontWeight: "700", fontSize: 13 },
  secondaryButton: { minHeight: 40, alignItems: "flex-start", justifyContent: "center", paddingVertical: 8, marginTop: 8 },
  secondaryButtonText: { color: ACCENT, fontWeight: "700", fontSize: 13 },
  statusBanner: { backgroundColor: "#EEF2FF", borderWidth: 1, borderColor: "#DFE5FF", borderRadius: 12, padding: 12, marginVertical: 8 },
  statusText: { fontSize: 12, lineHeight: 18, color: "#374151" },
  drawerRoot: { flex: 1, flexDirection: "row", backgroundColor: "rgba(0,0,0,0.35)" },
  drawerPanel: { width: 300, maxWidth: "86%", height: "100%", backgroundColor: "#FFF", paddingTop: Math.max(12, (NativeStatusBar.currentHeight ?? 0) + 10), paddingHorizontal: 14, paddingBottom: 16 },
  drawerScrim: { flex: 1 },
  drawerHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#E7EBF3" },
  drawerBrand: { fontSize: 16, color: "#111827", fontWeight: "800" },
  closeGlyph: { fontSize: 28, color: "#64748B", paddingHorizontal: 6 },
  drawerLinks: { paddingVertical: 12 },
  drawerItem: { flexDirection: "row", alignItems: "center", minHeight: 45, paddingHorizontal: 10, borderRadius: 9, marginBottom: 3 },
  drawerItemActive: { backgroundColor: "#EAF2FF" },
  drawerIcon: { width: 27, color: ACCENT, fontSize: 17, fontWeight: "700" },
  drawerLabel: { color: "#344054", fontSize: 13, fontWeight: "600" },
  drawerLabelActive: { color: ACCENT },
  drawerSeparator: { height: 1, backgroundColor: "#E7EBF3", marginVertical: 9 },
  drawerFootnote: { color: "#64748B", fontSize: 10, lineHeight: 15, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#E7EBF3" },
});
