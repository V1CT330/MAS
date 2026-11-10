import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import type { Listing } from "../shared/mas-core";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const BLUE = "#1877F2";
type Version = { id: string; version: string; file_url: string | null; created_at: string; status: string };
type LibraryListing = Listing & { listing_versions?: Version[] };
type InstalledRow = { id: string; listing_id: string; installed_version_id: string | null; installed_at: string; listings: LibraryListing | null };
type SavedRow = { listing_id: string; created_at: string; listings: Listing | null };
type HistoryRow = { id: string; created_at: string; listings: Listing | null };
type Tab = "installed" | "saved" | "history";

export default function LibraryScreen() {
  const [tab, setTab] = useState<Tab>("installed");
  const [userId, setUserId] = useState<string | null>(null);
  const [installed, setInstalled] = useState<InstalledRow[]>([]);
  const [saved, setSaved] = useState<SavedRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    if (!isSupabaseConfigured) { setUserId(null); setLoading(false); setError("MAS account services are not configured in this build."); return; }
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) { setUserId(null); setInstalled([]); setSaved([]); setHistory([]); setLoading(false); return; }
    const id = auth.user.id; setUserId(id);
    const [installedResult, savedResult, historyResult] = await Promise.all([
      supabase.from("installed_apps").select("id,listing_id,installed_version_id,installed_at,updated_at,listings(*,listing_versions(*))").eq("user_id", id).order("updated_at", { ascending: false }),
      supabase.from("wishlist").select("listing_id,created_at,listings(*)").eq("user_id", id).order("created_at", { ascending: false }),
      supabase.from("install_events").select("id,created_at,listings(*)").eq("user_id", id).order("created_at", { ascending: false }).limit(100),
    ]);
    const firstError = installedResult.error || savedResult.error || historyResult.error;
    if (firstError) setError(firstError.message);
    else { setInstalled((installedResult.data ?? []) as unknown as InstalledRow[]); setSaved((savedResult.data ?? []) as unknown as SavedRow[]); setHistory((historyResult.data ?? []) as unknown as HistoryRow[]); }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const removeSaved = async (listingId: string) => {
    if (!userId) return;
    setBusyId(listingId); setError("");
    const { error: requestError } = await supabase.from("wishlist").delete().eq("user_id", userId).eq("listing_id", listingId);
    if (requestError) setError(requestError.message); else await load();
    setBusyId(null);
  };

  const removeInstalled = async (rowId: string) => {
    if (!userId) return;
    setBusyId(rowId); setError("");
    const { error: requestError } = await supabase.from("installed_apps").delete().eq("id", rowId).eq("user_id", userId);
    if (requestError) setError(requestError.message); else await load();
    setBusyId(null);
  };

  const download = async (path: string | null, slug: string, version?: string) => {
    if (!path) throw new Error("This product does not have an approved downloadable package yet.");
    const { data, error: signError } = await supabase.storage.from("app-assets").createSignedUrl(path, 3600, { download: `${slug}${version ? `-${version}` : ""}.apk` });
    if (signError || !data?.signedUrl) throw new Error("Could not create a secure download link. Try again.");
    await Linking.openURL(data.signedUrl);
  };

  const downloadUpdate = async (row: InstalledRow, version: Version) => {
    setBusyId(row.id); setError("");
    try {
      await download(version.file_url, row.listings?.slug ?? "mas-app", version.version);
      setError("Update download opened. Install it from Downloads, then confirm the version below.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not open the update download."); }
    finally { setBusyId(null); }
  };

  const confirmUpdate = async (row: InstalledRow, version: Version) => {
    if (!userId) return;
    setBusyId(row.id); setError("");
    const { error: updateError } = await supabase.from("installed_apps").update({ installed_version_id: version.id }).eq("id", row.id).eq("user_id", userId);
    if (updateError) setError(updateError.message); else await load();
    setBusyId(null);
  };

  return <ScrollView style={styles.root} contentContainerStyle={styles.content}>
    <Text style={styles.heading}>My library</Text>
    <Text style={styles.subtitle}>Manage installed apps, saved listings and your download history.</Text>
    <View style={styles.tabs}>{(["installed", "saved", "history"] as Tab[]).map((value) => <TouchableOpacity key={value} onPress={() => setTab(value)} style={[styles.tab, tab === value && styles.tabActive]}><Text style={[styles.tabText, tab === value && styles.tabTextActive]}>{value === "installed" ? "Installed" : value === "saved" ? "Saved" : "History"}</Text></TouchableOpacity>)}</View>
    {loading ? <ActivityIndicator color={BLUE} style={{ marginTop: 28 }} /> : null}
    {!loading && !userId ? <View style={styles.empty}><Text style={styles.title}>Sign in to view your library</Text><Text style={styles.subtitle}>Your saved products and download history are linked to your MAS account.</Text></View> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {!loading && userId && tab === "installed" && installed.length === 0 ? <Empty text="Apps you install will appear here." /> : null}
    {!loading && userId && tab === "installed" ? installed.map((row) => {
      const product = row.listings;
      if (!product) return null;
      const latest = [...(product.listing_versions ?? [])].filter((v) => ["released", "published"].includes(v.status)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      const updateAvailable = Boolean(latest && latest.id !== row.installed_version_id);
      return <View style={styles.card} key={row.id}><Text style={styles.title}>{product.name}</Text><Text style={styles.subtitle}>{product.kind} · Installed {new Date(row.installed_at).toLocaleDateString()}</Text><Text style={styles.subtitle}>{updateAvailable ? `Update available · version ${latest?.version}` : "Up to date"}</Text>
        <View style={styles.actions}>{updateAvailable && latest ? <><Button label={busyId === row.id ? "Opening…" : "Download update"} disabled={Boolean(busyId)} onPress={() => void downloadUpdate(row, latest)} /><Button label="I installed it" disabled={Boolean(busyId)} secondary onPress={() => void confirmUpdate(row, latest)} /></> : <Button label="Download again" secondary disabled={Boolean(busyId)} onPress={() => { setBusyId(row.id); void download(latest?.file_url ?? null, product.slug, latest?.version).catch((e) => setError(e instanceof Error ? e.message : "Download failed.")).finally(() => setBusyId(null)); }} />}
        <Button label="Remove from library" secondary disabled={Boolean(busyId)} onPress={() => void removeInstalled(row.id)} /></View></View>;
    }) : null}
    {!loading && userId && tab === "saved" && saved.length === 0 ? <Empty text="Save any listing to find it here later." /> : null}
    {!loading && userId && tab === "saved" ? saved.map((row) => row.listings ? <View style={styles.card} key={row.listing_id}><Text style={styles.title}>{row.listings.name}</Text><Text style={styles.subtitle}>{row.listings.kind} · {row.listings.category}</Text><Button label={busyId === row.listing_id ? "Removing…" : "Remove saved listing"} secondary disabled={Boolean(busyId)} onPress={() => void removeSaved(row.listing_id)} /></View> : null) : null}
    {!loading && userId && tab === "history" && history.length === 0 ? <Empty text="Downloads you make will show up here." /> : null}
    {!loading && userId && tab === "history" ? history.map((row) => row.listings ? <View style={styles.card} key={row.id}><Text style={styles.title}>{row.listings.name}</Text><Text style={styles.subtitle}>{new Date(row.created_at).toLocaleString()}</Text></View> : null) : null}
    <TouchableOpacity onPress={() => void load()} style={styles.refresh}><Text style={styles.refreshText}>Refresh library</Text></TouchableOpacity>
  </ScrollView>;
}

function Empty({ text }: { text: string }) { return <View style={styles.empty}><Text style={styles.subtitle}>{text}</Text></View>; }
function Button({ label, onPress, disabled, secondary }: { label: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) { return <TouchableOpacity onPress={onPress} disabled={disabled} style={[styles.button, secondary && styles.buttonSecondary, disabled && styles.disabled]}><Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text></TouchableOpacity>; }
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#F6F7FB" }, content: { padding: 16, paddingBottom: 32 }, heading: { color: "#111827", fontSize: 24, fontWeight: "800" }, subtitle: { color: "#64748B", fontSize: 12, marginTop: 5, lineHeight: 18 }, tabs: { flexDirection: "row", backgroundColor: "#EAF0F8", borderRadius: 12, padding: 4, marginTop: 16 }, tab: { flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 9 }, tabActive: { backgroundColor: "#FFF" }, tabText: { color: "#64748B", fontSize: 12, fontWeight: "700" }, tabTextActive: { color: "#111827" }, card: { backgroundColor: "#FFF", borderRadius: 13, padding: 14, marginTop: 10, borderWidth: 1, borderColor: "#E7EBF3" }, title: { color: "#111827", fontSize: 14, fontWeight: "700" }, actions: { gap: 7, marginTop: 12 }, button: { minHeight: 38, justifyContent: "center", alignItems: "center", paddingHorizontal: 10, borderRadius: 9, backgroundColor: BLUE }, buttonSecondary: { backgroundColor: "#EFF4FA" }, buttonText: { color: "#FFF", fontSize: 12, fontWeight: "700" }, buttonTextSecondary: { color: BLUE }, disabled: { opacity: 0.55 }, empty: { backgroundColor: "#FFF", borderRadius: 13, padding: 20, marginTop: 14, alignItems: "center" }, error: { marginTop: 12, padding: 10, backgroundColor: "#FFF7ED", color: "#9A3412", borderRadius: 9, fontSize: 12 }, refresh: { padding: 14, alignItems: "center" }, refreshText: { color: BLUE, fontWeight: "700", fontSize: 12 } });
