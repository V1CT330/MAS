import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { CATEGORIES, matchesListingFilters, matchesSearch, rankListings, type Listing } from "../shared/mas-core";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const ACCENT = "#1877F2";
const WEB_ORIGIN = "https://malawian-app-store-j6pm.vercel.app";
type StoreListing = Listing & { developer?: { developer_name?: string | null; display_name?: string | null } | null; iconDisplayUrl?: string | null };
type StoreKind = "all" | "app" | "website" | "ai_agent" | "extension";

export default function StoreScreen() {
  const [listings, setListings] = useState<StoreListing[]>([]);
  const [search, setSearch] = useState("");
  const [kind, setKind] = useState<StoreKind>("all");
  const [category, setCategory] = useState("All");
  const [selected, setSelected] = useState<StoreListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const loadListings = async () => {
    if (!isSupabaseConfigured) {
      setListings([]);
      setNotice("MAS catalogue is unavailable until the app is configured with the public Supabase client.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotice("");
    const [listingResult, profileResult] = await Promise.all([
      supabase.from("listings").select("id,developer_id,slug,name,tagline,description,category,kind,icon_url,screenshots,website_url,price_mwk,status,downloads,rating_avg,rating_count,created_at,updated_at").eq("status", "published").order("created_at", { ascending: false }).limit(200),
      supabase.from("public_profiles").select("id,developer_name,display_name"),
    ]);
    if (listingResult.error || profileResult.error) {
      setNotice(listingResult.error?.message ?? profileResult.error?.message ?? "Could not load the MAS catalogue.");
      setLoading(false);
      return;
    }
    const profiles = new Map((profileResult.data ?? []).map((p) => [p.id, p]));
    const rows = await Promise.all((listingResult.data ?? []).map(async (row) => {
      const rawIcon = row.icon_url;
      let iconDisplayUrl: string | null = null;
      if (rawIcon?.startsWith("https://")) iconDisplayUrl = rawIcon;
      else if (rawIcon) {
        const { data } = await supabase.storage.from("app-assets").createSignedUrl(rawIcon, 3600);
        iconDisplayUrl = data?.signedUrl ?? null;
      }
      return { ...(row as unknown as Listing), developer: profiles.get(row.developer_id) ?? null, iconDisplayUrl };
    }));
    setListings(rows);
    setLoading(false);
  };

  useEffect(() => { void loadListings(); }, []);

  const filtered = useMemo(() => rankListings(
    listings.filter((item) =>
      matchesSearch([item.name, item.tagline, item.description, item.category, item.kind, item.developer?.developer_name, item.developer?.display_name], search)
      && matchesListingFilters(item, { kind, category }),
    ),
    { query: search, limit: 200 },
  ), [listings, search, kind, category]);

  const runInstall = async (item: StoreListing) => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      await Linking.openURL(`${WEB_ORIGIN}/auth?redirect=${encodeURIComponent(`/apps/${item.slug}`)}`);
      return;
    }
    if (item.kind === "website") {
      if (!item.website_url || !/^https:\/\//.test(item.website_url)) throw new Error("This website does not have a valid secure address.");
      await Linking.openURL(item.website_url);
    } else {
      const { data: versions, error } = await supabase.from("listing_versions").select("id,version,file_url").eq("listing_id", item.id).in("status", ["released", "published"]).order("created_at", { ascending: false }).limit(1);
      if (error) throw error;
      const version = versions?.[0];
      if (!version?.file_url) throw new Error("There is no approved download package for this listing yet.");
      const { data: signed, error: signedError } = await supabase.storage.from("app-assets").createSignedUrl(version.file_url, 3600, { download: `${item.slug}-${version.version}.${item.kind === "app" ? "apk" : "zip"}` });
      if (signedError || !signed?.signedUrl) throw new Error("Could not prepare the secure download. Please try again.");
      await Linking.openURL(signed.signedUrl);
    }
    const { error: installError } = await supabase.rpc("register_install", { _listing_id: item.id, _device: "Android" });
    if (installError) throw installError;
    setNotice(item.kind === "website" ? "Website opened and visit recorded." : `${item.kind === "ai_agent" ? "AI agent" : item.kind === "extension" ? "Browser extension" : "App"} package download opened.`);
  };

  const toggleSaved = async (item: StoreListing) => {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw new Error("Sign in to save products to your library.");
    const { data: existing, error: lookupError } = await supabase.from("wishlist").select("id").eq("user_id", auth.user.id).eq("listing_id", item.id).maybeSingle();
    if (lookupError) throw lookupError;
    const result = existing
      ? await supabase.from("wishlist").delete().eq("id", existing.id)
      : await supabase.from("wishlist").insert({ user_id: auth.user.id, listing_id: item.id });
    if (result.error) throw result.error;
    setNotice(existing ? "Removed from your saved library." : "Saved to your library.");
  };

  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try { await action(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "That action could not be completed."); }
    finally { setBusy(false); }
  };

  const kinds: { value: StoreKind; label: string }[] = [
    { value: "all", label: "For you" },
    { value: "app", label: "Apps" },
    { value: "website", label: "Websites" },
    { value: "ai_agent", label: "AI agents" },
    { value: "extension", label: "Extensions" },
  ];

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>Discover apps and websites</Text>
        <Text style={styles.subheading}>Explore products published by Malawian developers.</Text>
        <TextInput value={search} onChangeText={(value) => setSearch(value.slice(0, 120))} placeholder="Search apps, websites or developers" accessibilityLabel="Search the MAS catalogue" style={styles.search} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {kinds.map((item) => <TouchableOpacity key={item.value} onPress={() => setKind(item.value)} style={[styles.chip, kind === item.value && styles.chipActive]}><Text style={[styles.chipText, kind === item.value && styles.chipTextActive]}>{item.label}</Text></TouchableOpacity>)}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {["All", ...CATEGORIES].map((item) => <TouchableOpacity key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipActive]}><Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text></TouchableOpacity>)}
        </ScrollView>
        {loading ? <ActivityIndicator style={styles.loading} color={ACCENT} /> : null}
        {!loading && !filtered.length ? <View style={styles.empty}><Text style={styles.title}>{notice ? "Store unavailable" : search || kind !== "all" || category !== "All" ? "No matching products" : "Nothing here yet"}</Text><Text style={styles.body}>{notice || (search || kind !== "all" || category !== "All" ? "Try a different search or filter." : "New listings from Malawian developers will appear here.")}</Text>{notice ? <TouchableOpacity style={styles.secondaryButton} onPress={() => void loadListings()}><Text style={styles.secondaryText}>Try again</Text></TouchableOpacity> : null}</View> : null}
        {filtered.map((item) => <TouchableOpacity key={item.id} accessibilityRole="button" onPress={() => setSelected(item)} style={styles.card}>
          {item.iconDisplayUrl ? <Image source={{ uri: item.iconDisplayUrl }} style={styles.icon} /> : <View style={[styles.icon, styles.iconFallback]}><Text style={styles.iconLetter}>{item.name.slice(0, 1).toUpperCase()}</Text></View>}
          <View style={styles.cardText}><Text numberOfLines={1} style={styles.title}>{item.name}</Text><Text numberOfLines={2} style={styles.body}>{item.tagline || item.description || "Discover this MAS listing"}</Text><Text style={styles.meta}>{item.kind === "website" ? "Website" : item.kind === "ai_agent" ? "AI agent" : item.kind === "extension" ? "Browser extension" : "App"} · {item.category} · {Number(item.downloads ?? 0).toLocaleString()} {item.kind === "website" ? "visits" : "installs"}</Text></View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>)}
        {notice && filtered.length ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
      </ScrollView>
      <Modal visible={Boolean(selected)} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected ? <View style={styles.modalRoot}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <TouchableOpacity onPress={() => setSelected(null)} accessibilityLabel="Close product details" style={styles.close}><Text style={styles.closeText}>×</Text></TouchableOpacity>
            <View style={styles.detailHeader}>{selected.iconDisplayUrl ? <Image source={{ uri: selected.iconDisplayUrl }} style={styles.detailIcon} /> : <View style={[styles.detailIcon, styles.iconFallback]}><Text style={styles.iconLetter}>{selected.name.slice(0, 1).toUpperCase()}</Text></View>}<View style={styles.cardText}><Text style={styles.heading}>{selected.name}</Text><Text style={styles.body}>{selected.developer?.developer_name || selected.developer?.display_name || "MAS developer"}</Text><Text style={styles.meta}>{selected.kind} · {selected.category} · ★ {Number(selected.rating_avg ?? 0).toFixed(1)} ({selected.rating_count ?? 0})</Text></View></View>
            {selected.description ? <View style={styles.detailSection}><Text style={styles.title}>About</Text><Text style={styles.body}>{selected.description}</Text></View> : null}
            {selected.screenshots?.length ? <><Text style={styles.title}>Screenshots</Text><ScrollView horizontal>{selected.screenshots.map((url, index) => <Image key={`${selected.id}-${index}`} source={{ uri: url }} style={styles.screenshot} resizeMode="cover" />)}</ScrollView></> : null}
            {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
            <TouchableOpacity disabled={busy} style={styles.primaryButton} onPress={() => void perform(() => runInstall(selected))}><Text style={styles.primaryText}>{busy ? "Please wait…" : selected.kind === "website" ? "Open website" : selected.kind === "ai_agent" ? "Download AI agent" : selected.kind === "extension" ? "Download extension" : "Download app"}</Text></TouchableOpacity>
            <TouchableOpacity disabled={busy} style={styles.secondaryButton} onPress={() => void perform(() => toggleSaved(selected))}><Text style={styles.secondaryText}>Save / remove from library</Text></TouchableOpacity>
            <Text style={styles.footnote}>Downloads and library access use your MAS account and the existing secure MAS storage and backend services.</Text>
          </ScrollView>
        </View> : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F6F7FB" }, content: { padding: 16, paddingBottom: 32 }, heading: { color: "#111827", fontSize: 23, fontWeight: "800" }, subheading: { color: "#64748B", fontSize: 13, marginTop: 5, marginBottom: 14 }, search: { backgroundColor: "#FFF", borderColor: "#DCE2EA", borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, minHeight: 46, color: "#111827", marginBottom: 10 }, row: { gap: 8, paddingVertical: 5, paddingRight: 8 }, chip: { borderWidth: 1, borderColor: "#DCE2EA", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#FFF" }, chipActive: { backgroundColor: ACCENT, borderColor: ACCENT }, chipText: { color: "#52607A", fontSize: 12, fontWeight: "600" }, chipTextActive: { color: "#FFF" }, loading: { marginTop: 30 }, empty: { alignItems: "center", backgroundColor: "#FFF", borderRadius: 14, padding: 22, marginTop: 12 }, title: { color: "#111827", fontSize: 15, fontWeight: "700" }, body: { color: "#64748B", fontSize: 13, lineHeight: 19, marginTop: 4 }, card: { backgroundColor: "#FFF", borderRadius: 13, padding: 12, marginTop: 8, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: "#E7EBF3" }, icon: { width: 54, height: 54, borderRadius: 13, backgroundColor: "#EFF4FA" }, iconFallback: { alignItems: "center", justifyContent: "center" }, iconLetter: { color: ACCENT, fontSize: 22, fontWeight: "800" }, cardText: { flex: 1, minWidth: 0 }, meta: { color: "#64748B", fontSize: 10, marginTop: 5, textTransform: "capitalize" }, chevron: { color: "#64748B", fontSize: 25 }, notice: { color: "#9A3412", backgroundColor: "#FFF7ED", padding: 11, borderRadius: 9, marginTop: 10, fontSize: 12 }, modalRoot: { flex: 1, backgroundColor: "#F6F7FB" }, modalContent: { padding: 18, paddingTop: 36, paddingBottom: 40 }, close: { alignSelf: "flex-end", paddingHorizontal: 8 }, closeText: { fontSize: 30, color: "#64748B" }, detailHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 }, detailIcon: { width: 76, height: 76, borderRadius: 18, backgroundColor: "#EFF4FA" }, detailSection: { backgroundColor: "#FFF", borderRadius: 13, padding: 14, marginVertical: 10 }, screenshot: { width: 190, height: 300, borderRadius: 12, marginRight: 10, marginVertical: 10, backgroundColor: "#E7EBF3" }, primaryButton: { backgroundColor: ACCENT, minHeight: 46, borderRadius: 11, justifyContent: "center", alignItems: "center", marginTop: 16 }, primaryText: { color: "#FFF", fontSize: 14, fontWeight: "700" }, secondaryButton: { minHeight: 42, justifyContent: "center", alignItems: "center", marginTop: 8 }, secondaryText: { color: ACCENT, fontSize: 13, fontWeight: "700" }, footnote: { color: "#64748B", fontSize: 11, lineHeight: 16, marginTop: 12 },
});
