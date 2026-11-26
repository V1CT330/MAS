import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  type ImageStyle,
  type StyleProp,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { CATEGORIES, matchesListingFilters, matchesSearch, rankListings, topByNumber, type Listing } from "../shared/mas-core";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const ACCENT = "#1877F2";
const WEB_ORIGIN = "https://malawian-app-store.vercel.app";

async function resolveStoreImageUrl(value: string | null | undefined): Promise<string | null> {
  const raw = value?.trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  const objectPath = raw.replace(/^\/+/, "").replace(/^app-assets\//i, "");
  const { data, error } = await supabase.storage.from("app-assets").createSignedUrl(objectPath, 24 * 60 * 60);
  if (error || !data?.signedUrl) {
    console.warn("MAS listing image could not be resolved.", { value: raw, error });
    return null;
  }
  return data.signedUrl;
}

/** Resolve private screenshot objects in one request; public image URLs pass through unchanged. */
async function resolveStoreImageUrls(values: Array<string | null | undefined>): Promise<Array<string | null>> {
  const normalized = values.map((value) => value?.trim() ?? "");
  const storagePaths = Array.from(new Set(normalized
    .filter((value) => value && !/^https?:\/\//i.test(value))
    .map((value) => value.replace(/^\/+/, "").replace(/^app-assets\//i, ""))));
  const signedByPath = new Map<string, string>();
  // Supabase Storage accepts batches; chunking avoids oversized requests on large catalogues.
  for (let offset = 0; offset < storagePaths.length; offset += 100) {
    const batch = storagePaths.slice(offset, offset + 100);
    const { data, error } = await supabase.storage.from("app-assets").createSignedUrls(batch, 24 * 60 * 60);
    if (error) {
      console.warn("MAS listing screenshots could not be resolved.", error);
      continue;
    }
    for (const item of data ?? []) {
      if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
    }
  }
  return normalized.map((value) => {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    const objectPath = value.replace(/^\/+/, "").replace(/^app-assets\//i, "");
    return signedByPath.get(objectPath) ?? null;
  });
}

type StoreListing = Listing & {
  developer?: { developer_name?: string | null; display_name?: string | null } | null;
  iconDisplayUrl?: string | null;
  screenshotDisplayUrls?: Array<string | null>;
};

function PreviewImage({ uri, style, resizeMode = "cover" }: { uri: string; style: StyleProp<ImageStyle>; resizeMode?: "cover" | "contain" }) {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(false); }, [uri]);
  return <Image source={{ uri }} resizeMode={resizeMode} onLoad={() => setLoaded(true)} style={[style, { opacity: loaded ? 1 : 0 }]} />;
}
type SponsoredCreative = {
  id: string;
  headline: string;
  body: string | null;
  image_url: string | null;
  destination_url: string;
  placements: string[];
  creative_type: "app_listing" | "website_banner" | "custom";
  listing_slug: string | null;
  listing_name: string | null;
  listing_icon_url: string | null;
  listing_banner_url: string | null;
  listing_kind: string | null;
  listing_status: string | null;
  imageDisplayUrl: string | null;
};
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
  const [sponsoredAds, setSponsoredAds] = useState<SponsoredCreative[]>([]);
  const [adsLoading, setAdsLoading] = useState(true);

  const loadGeneration = useRef(0);
  const trackedSponsoredImpressions = useRef(new Set<string>());
  const loadListings = useCallback(async () => {
    const requestId = ++loadGeneration.current;
    setLoading(true);
    setNotice("");
    try {
      if (!isSupabaseConfigured) {
        setListings([]);
        setNotice("MAS catalogue is unavailable until the app is configured with the public Supabase client.");
        return;
      }
      const [listingResult, profileResult] = await Promise.all([
        supabase.from("listings").select("id,developer_id,slug,name,tagline,description,category,kind,icon_url,screenshots,website_url,price_mwk,status,downloads,rating_avg,rating_count,created_at,updated_at").eq("status", "published").order("created_at", { ascending: false }),
        supabase.from("public_profiles").select("id,developer_name,display_name"),
      ]);
      if (requestId !== loadGeneration.current) return;
      if (listingResult.error || profileResult.error) {
        setNotice(listingResult.error?.message ?? profileResult.error?.message ?? "Could not load the MAS catalogue.");
        return;
      }
      const profiles = new Map((profileResult.data ?? []).map((profile) => [profile.id, profile]));
      const rows = await Promise.all((listingResult.data ?? []).map(async (row) => {
        const [iconDisplayUrl, screenshotDisplayUrls] = await Promise.all([
          resolveStoreImageUrl(row.icon_url),
          resolveStoreImageUrls((row.screenshots ?? []) as string[]),
        ]);
        return { ...(row as unknown as Listing), developer: profiles.get(row.developer_id) ?? null, iconDisplayUrl, screenshotDisplayUrls };
      }));
      if (requestId !== loadGeneration.current) return;
      setListings(rows);
    } catch (error) {
      if (requestId !== loadGeneration.current) return;
      setNotice(error instanceof Error ? error.message : "Could not load the MAS catalogue. Check your connection and try again.");
    } finally {
      if (requestId === loadGeneration.current) setLoading(false);
    }
  }, []);
  useEffect(() => { void loadListings(); return () => { loadGeneration.current += 1; }; }, [loadListings]);

  useEffect(() => {
    let active = true;
    const loadSponsoredAds = async () => {
      try {
        if (!isSupabaseConfigured) return;
        const adsDb = supabase as any;
        const columns = "id,headline,body,image_url,destination_url,placements,creative_type,listing_slug,listing_name,listing_icon_url,listing_banner_url,listing_kind,listing_status";
        const [apps, websites] = await Promise.all([
          adsDb.from("active_ad_creatives").select(columns).eq("creative_type", "app_listing").contains("placements", ["store"]).limit(4),
          adsDb.from("active_ad_creatives").select(columns).eq("creative_type", "website_banner").contains("placements", ["store"]).limit(4),
        ]);
        if (!active) return;
        if (apps.error || websites.error) {
          console.warn("MAS sponsored store placements could not be loaded.", apps.error ?? websites.error);
          return;
        }
        const creatives = [...(apps.data ?? []), ...(websites.data ?? [])] as Array<Omit<SponsoredCreative, "imageDisplayUrl">>;
        const resolved = await Promise.all(creatives.map(async (ad) => {
          const rawImage = ad.creative_type === "app_listing"
            ? ad.listing_icon_url
            : ad.image_url || ad.listing_banner_url || ad.listing_icon_url;
          const imageDisplayUrl = await resolveStoreImageUrl(rawImage);
          return { ...ad, imageDisplayUrl };
        }));
        if (active) setSponsoredAds(resolved.filter((ad) => ad.creative_type === "app_listing" || ad.creative_type === "website_banner"));
      } catch (error) {
        console.warn("MAS sponsored store placements could not be loaded.", error);
      } finally {
        if (active) setAdsLoading(false);
      }
    };
    void loadSponsoredAds();
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => rankListings(
    listings.filter((item) =>
      matchesSearch([item.name, item.tagline, item.description, item.category, item.kind, item.developer?.developer_name, item.developer?.display_name], search)
      && matchesListingFilters(item, { kind, category }),
    ),
    { query: search, limit: 200 },
  ), [listings, search, kind, category]);

  const isBrowsing = !search.trim() && kind === "all" && category === "All";
  const sponsoredApps = useMemo(() => sponsoredAds.filter((ad) => ad.creative_type === "app_listing" && ad.listing_kind === "app"), [sponsoredAds]);
  const sponsoredWebsites = useMemo(() => sponsoredAds.filter((ad) => ad.creative_type === "website_banner" && (!ad.listing_kind || ad.listing_kind === "website")), [sponsoredAds]);
  const showSponsoredApps = !search.trim() && kind !== "website";
  const showSponsoredWebsites = !search.trim() && kind !== "app";
  const visibleSponsoredIds = sponsoredAds
    .filter((ad) => ad.creative_type === "app_listing" ? showSponsoredApps : showSponsoredWebsites)
    .map((ad) => ad.id)
    .join(",");
  const hasVisibleSponsored = (showSponsoredApps && sponsoredApps.length > 0) || (showSponsoredWebsites && sponsoredWebsites.length > 0);
  useEffect(() => {
    if (!visibleSponsoredIds) return;
    let active = true;
    void (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!active || !data.user) return;
        for (const campaignId of visibleSponsoredIds.split(",").filter(Boolean)) {
          if (trackedSponsoredImpressions.current.has(campaignId)) continue;
          trackedSponsoredImpressions.current.add(campaignId);
          try {
            const { error } = await (supabase as any).from("ad_events").insert({ campaign_id: campaignId, event_type: "impression", viewer_id: data.user.id });
            if (error && error.code !== "23505") trackedSponsoredImpressions.current.delete(campaignId);
          } catch {
            trackedSponsoredImpressions.current.delete(campaignId);
          }
        }
      } catch {
        // Ad telemetry must never block the catalogue.
      }
    })();
    return () => { active = false; };
  }, [visibleSponsoredIds]);
  const recommended = useMemo(() => rankListings(listings, { limit: 8, maxPerCategory: 2 }), [listings]);
  const topCharts = useMemo(() => topByNumber(listings, (item) => item.downloads, 8), [listings]);
  const topRated = useMemo(() => topByNumber(listings, (item) => Number(item.rating_avg ?? 0) * Number(item.rating_count ?? 0), 8), [listings]);

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

  const recordSponsoredClick = async (campaignId: string) => {
    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { error } = await (supabase as any).from("ad_events").insert({ campaign_id: campaignId, event_type: "click", viewer_id: data.user.id });
      if (error) console.warn("MAS sponsored click could not be recorded.", error);
    } catch (error) {
      console.warn("MAS sponsored click could not be recorded.", error);
    }
  };

  const openSponsored = async (ad: SponsoredCreative) => {
    if (ad.creative_type === "app_listing") {
      if (ad.listing_status !== "published" || !ad.listing_slug) return;
      void recordSponsoredClick(ad.id);
      try {
        await Linking.openURL(`${WEB_ORIGIN}/apps/${encodeURIComponent(ad.listing_slug)}`);
      } catch {
        setNotice("Could not open this sponsored app.");
      }
      return;
    }
    try {
      const destination = new URL(ad.destination_url);
      if (destination.protocol !== "https:") throw new Error("This sponsored website does not have a secure HTTPS address.");
      void recordSponsoredClick(ad.id);
      await Linking.openURL(destination.toString());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not open this sponsored website.");
    }
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
        {!loading && showSponsoredApps && sponsoredApps.length > 0 ? <View style={styles.sponsoredSection}>
          <Text style={styles.sponsoredHeading}>Sponsored apps</Text>
          {sponsoredApps.map((ad) => {
            const canOpen = ad.listing_status === "published" && Boolean(ad.listing_slug);
            const content = <View style={styles.sponsoredAppRow}>
              {ad.imageDisplayUrl ? <Image source={{ uri: ad.imageDisplayUrl }} style={styles.sponsoredAppIcon} /> : <View style={styles.sponsoredIconFallback}><Text style={styles.iconLetter}>{(ad.listing_name || ad.headline).slice(0, 1).toUpperCase()}</Text></View>}
              <View style={styles.sponsoredCopy}>
                <Text numberOfLines={1} style={styles.sponsoredTitle}>{ad.listing_name || ad.headline}</Text>
                {ad.body ? <Text numberOfLines={2} style={styles.sponsoredBody}>{ad.body}</Text> : null}
                <View style={styles.sponsoredMetaRow}><Text style={styles.sponsoredMeta}>Sponsored</Text>{!canOpen ? <Text style={styles.sponsoredComingSoon}>Coming soon</Text> : null}</View>
              </View>
            </View>;
            return canOpen
              ? <TouchableOpacity key={ad.id} accessibilityRole="button" onPress={() => void openSponsored(ad)}>{content}</TouchableOpacity>
              : <View key={ad.id}>{content}</View>;
          })}
        </View> : null}
        {!loading && showSponsoredWebsites && sponsoredWebsites.length > 0 ? <View style={styles.sponsoredSection}>
          {sponsoredWebsites.map((ad) => <TouchableOpacity key={ad.id} accessibilityRole="button" onPress={() => void openSponsored(ad)} style={styles.sponsoredWebsite}>
            {ad.imageDisplayUrl ? <Image source={{ uri: ad.imageDisplayUrl }} style={styles.sponsoredBanner} resizeMode="cover" /> : null}
            <View style={styles.sponsoredWebsiteCopy}>
              <Text numberOfLines={1} style={styles.sponsoredTitle}>{ad.listing_name || ad.headline}</Text>
              {ad.body ? <Text numberOfLines={2} style={styles.sponsoredBody}>{ad.body}</Text> : null}
              <Text style={styles.sponsoredMeta}>Sponsored website</Text>
            </View>
          </TouchableOpacity>)}
        </View> : null}
        {!loading && !filtered.length && !hasVisibleSponsored && !adsLoading ? <View style={styles.empty}><Text style={styles.title}>{notice ? "Store unavailable" : search || kind !== "all" || category !== "All" ? "No matching products" : "Nothing here yet"}</Text><Text style={styles.body}>{notice || (search || kind !== "all" || category !== "All" ? "Try a different search or filter." : "New listings from Malawian developers will appear here.")}</Text>{notice ? <TouchableOpacity style={styles.secondaryButton} onPress={() => void loadListings()}><Text style={styles.secondaryText}>Try again</Text></TouchableOpacity> : null}</View> : null}
        {isBrowsing && !loading && filtered.length > 0 ? <>
          <DiscoveryShelf title="Recommended for you" subtitle="Fresh from Malawian developers" items={recommended} onSelect={setSelected} />
          <DiscoveryShelf title="Top charts" subtitle="Most popular listings" items={topCharts} onSelect={setSelected} />
          <DiscoveryShelf title="Top rated" subtitle="Listings with the strongest ratings" items={topRated} onSelect={setSelected} />
        </> : null}
        {!loading && filtered.length > 0 ? <Text style={styles.listHeading}>{isBrowsing ? "All listings" : `${filtered.length} result${filtered.length === 1 ? "" : "s"}`}</Text> : null}
        {filtered.map((item) => <View key={item.id} style={styles.card}>
          <TouchableOpacity accessibilityRole="button" onPress={() => setSelected(item)} style={styles.cardHeader}>
            {item.iconDisplayUrl ? <PreviewImage uri={item.iconDisplayUrl} style={styles.icon} /> : <View style={[styles.icon, styles.iconFallback]}><Text style={styles.iconLetter}>{item.name.slice(0, 1).toUpperCase()}</Text></View>}
            <View style={styles.cardText}>
              <Text numberOfLines={1} style={styles.title}>{item.name}</Text>
              <Text numberOfLines={2} style={styles.body}>{item.tagline || item.description || "Discover this MAS listing"}</Text>
              <Text style={styles.meta}>{item.kind === "website" ? "Website" : item.kind === "ai_agent" ? "AI agent" : item.kind === "extension" ? "Browser extension" : "App"} · {item.category} · {Number(item.downloads ?? 0).toLocaleString()} {item.kind === "website" ? "visits" : "installs"}</Text>
            </View>
          </TouchableOpacity>
          {!!item.screenshotDisplayUrls?.some(Boolean) ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.previewRow}>
            {item.screenshotDisplayUrls.slice(0, 8).map((url, index) => url ? <TouchableOpacity key={`${item.id}-preview-${index}`} accessibilityRole="button" accessibilityLabel={`View ${item.name} screenshot ${index + 1}`} onPress={() => setSelected(item)} style={[styles.previewFrame, item.kind === "website" && styles.websitePreviewFrame]}>
              <PreviewImage uri={url} style={[styles.previewImage, item.kind === "website" && styles.websitePreviewImage]} resizeMode="contain" />
            </TouchableOpacity> : null)}
          </ScrollView> : null}
        </View>)}
        {notice && filtered.length ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
      </ScrollView>
      <Modal visible={Boolean(selected)} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected ? <View style={styles.modalRoot}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <TouchableOpacity onPress={() => setSelected(null)} accessibilityLabel="Close product details" style={styles.close}><Text style={styles.closeText}>×</Text></TouchableOpacity>
            <View style={styles.detailHeader}>{selected.iconDisplayUrl ? <PreviewImage uri={selected.iconDisplayUrl} style={styles.detailIcon} /> : <View style={[styles.detailIcon, styles.iconFallback]}><Text style={styles.iconLetter}>{selected.name.slice(0, 1).toUpperCase()}</Text></View>}<View style={styles.cardText}><Text style={styles.heading}>{selected.name}</Text><Text style={styles.body}>{selected.developer?.developer_name || selected.developer?.display_name || "MAS developer"}</Text><Text style={styles.meta}>{selected.kind} · {selected.category} · ★ {Number(selected.rating_avg ?? 0).toFixed(1)} ({selected.rating_count ?? 0})</Text></View></View>
            {selected.description ? <View style={styles.detailSection}><Text style={styles.title}>About</Text><Text style={styles.body}>{selected.description}</Text></View> : null}
            {selected.screenshotDisplayUrls?.some(Boolean) ? <><Text style={styles.sectionTitle}>Screenshots</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.detailPreviewRow}>{selected.screenshotDisplayUrls.map((url, index) => url ? <View key={`${selected.id}-${index}`} style={[styles.screenshotFrame, selected.kind === "website" && styles.websiteScreenshotFrame]}><PreviewImage uri={url} style={styles.screenshot} resizeMode="contain" /></View> : null)}</ScrollView></> : null}
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

function DiscoveryShelf({ title, subtitle, items, onSelect }: { title: string; subtitle: string; items: StoreListing[]; onSelect: (item: StoreListing) => void }) {
  if (!items.length) return null;
  return <View style={styles.shelf}>
    <Text style={styles.shelfTitle}>{title}</Text>
    <Text style={styles.shelfSubtitle}>{subtitle}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelfRow}>
      {items.map((item) => <TouchableOpacity key={item.id} accessibilityRole="button" onPress={() => onSelect(item)} style={styles.shelfTile}>
        {item.iconDisplayUrl ? <PreviewImage uri={item.iconDisplayUrl} style={styles.shelfIcon} /> : <View style={[styles.shelfIcon, styles.iconFallback]}><Text style={styles.iconLetter}>{item.name.slice(0, 1).toUpperCase()}</Text></View>}
        <Text numberOfLines={1} style={styles.shelfName}>{item.name}</Text>
        <Text numberOfLines={1} style={styles.shelfMeta}>{item.kind === "website" ? "Website" : item.kind === "ai_agent" ? "AI agent" : item.kind === "extension" ? "Extension" : "App"}</Text>
      </TouchableOpacity>)}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" }, sponsoredSection: { marginTop: 14, marginBottom: 6 }, sponsoredHeading: { color: "#52607A", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }, sponsoredAppRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "#E7EBF3" }, sponsoredAppIcon: { width: 56, height: 56, borderRadius: 14, backgroundColor: "#EFF4FA" }, sponsoredIconFallback: { width: 56, height: 56, borderRadius: 14, backgroundColor: "#EFF4FA", alignItems: "center", justifyContent: "center" }, sponsoredCopy: { flex: 1, minWidth: 0 }, sponsoredTitle: { color: "#111827", fontSize: 14, fontWeight: "700" }, sponsoredBody: { color: "#64748B", fontSize: 12, lineHeight: 17, marginTop: 3 }, sponsoredMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 }, sponsoredMeta: { color: "#64748B", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.35 }, sponsoredComingSoon: { color: ACCENT, fontSize: 10, fontWeight: "700" }, sponsoredWebsite: { borderBottomWidth: 1, borderBottomColor: "#E7EBF3", paddingBottom: 10, marginBottom: 10 }, sponsoredBanner: { width: "100%", height: 136, backgroundColor: "#EFF4FA" }, sponsoredWebsiteCopy: { paddingTop: 9 }, shelf: { marginTop: 18 }, shelfTitle: { color: "#111827", fontSize: 17, fontWeight: "800" }, shelfSubtitle: { color: "#64748B", fontSize: 11, marginTop: 3 }, shelfRow: { gap: 10, paddingVertical: 10 }, shelfTile: { width: 104, padding: 0, backgroundColor: "transparent" }, shelfIcon: { width: 104, height: 104, borderRadius: 22, backgroundColor: "#EFF4FA", alignSelf: "center" }, shelfName: { color: "#111827", fontSize: 13, fontWeight: "600", marginTop: 8 }, shelfMeta: { color: "#64748B", fontSize: 11, marginTop: 3 }, content: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 36 }, heading: { color: "#202124", fontSize: 22, fontWeight: "700" }, subheading: { color: "#5F6368", fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 14 }, listHeading: { color: "#202124", fontSize: 18, fontWeight: "700", marginTop: 20, marginBottom: 8 }, search: { backgroundColor: "#FFF", borderColor: "#DCE2EA", borderWidth: 1, borderRadius: 12, paddingHorizontal: 13, minHeight: 46, color: "#111827", marginBottom: 10 }, row: { gap: 8, paddingVertical: 5, paddingRight: 8 }, chip: { borderWidth: 1, borderColor: "#DCE2EA", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "#FFF" }, chipActive: { backgroundColor: ACCENT, borderColor: ACCENT }, chipText: { color: "#52607A", fontSize: 12, fontWeight: "600" }, chipTextActive: { color: "#FFF" }, loading: { marginTop: 30 }, empty: { alignItems: "center", backgroundColor: "#FFF", borderRadius: 14, padding: 22, marginTop: 12 }, title: { color: "#202124", fontSize: 16, fontWeight: "600" }, body: { color: "#5F6368", fontSize: 13, lineHeight: 19, marginTop: 4 }, card: { backgroundColor: "#FFFFFF", paddingTop: 12, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#F1F3F4" }, cardHeader: { paddingHorizontal: 2, flexDirection: "row", alignItems: "center", gap: 14, minHeight: 76 }, icon: { width: 64, height: 64, borderRadius: 16, backgroundColor: "#F1F3F4" }, previewRow: { gap: 10, paddingTop: 12, paddingBottom: 2, paddingLeft: 2, paddingRight: 8 }, previewFrame: { width: 116, height: 164, borderRadius: 12, overflow: "hidden", borderWidth: 1, borderColor: "#E8EAED", backgroundColor: "#F8F9FA", padding: 3 }, previewImage: { width: "100%", height: "100%", borderRadius: 9, backgroundColor: "#F1F3F4" }, websitePreviewFrame: { width: 210, height: 112 }, websitePreviewImage: { borderRadius: 8 }, iconFallback: { alignItems: "center", justifyContent: "center" }, iconLetter: { color: ACCENT, fontSize: 22, fontWeight: "800" }, cardText: { flex: 1, minWidth: 0 }, meta: { color: "#5F6368", fontSize: 12, marginTop: 6, textTransform: "capitalize" }, notice: { color: "#9A3412", backgroundColor: "#FFF7ED", padding: 11, borderRadius: 9, marginTop: 10, fontSize: 12 }, modalRoot: { flex: 1, backgroundColor: "#FFFFFF" }, modalContent: { padding: 18, paddingTop: 36, paddingBottom: 40 }, close: { alignSelf: "flex-end", paddingHorizontal: 8 }, closeText: { fontSize: 30, color: "#64748B" }, detailHeader: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 }, detailIcon: { width: 76, height: 76, borderRadius: 18, backgroundColor: "#EFF4FA" }, detailSection: { backgroundColor: "#F8F9FA", borderRadius: 13, padding: 14, marginVertical: 10 }, sectionTitle: { color: "#202124", fontSize: 18, fontWeight: "700", marginTop: 12, marginBottom: 4 }, detailPreviewRow: { gap: 12, paddingVertical: 12, paddingRight: 8 }, screenshotFrame: { width: 210, height: 320, borderRadius: 14, borderWidth: 1, borderColor: "#E8EAED", padding: 4, backgroundColor: "#F8F9FA", overflow: "hidden" }, websiteScreenshotFrame: { width: 300, height: 190 }, screenshot: { width: "100%", height: "100%", borderRadius: 10, backgroundColor: "#F1F3F4" }, primaryButton: { backgroundColor: ACCENT, minHeight: 46, borderRadius: 11, justifyContent: "center", alignItems: "center", marginTop: 16 }, primaryText: { color: "#FFF", fontSize: 14, fontWeight: "700" }, secondaryButton: { minHeight: 42, justifyContent: "center", alignItems: "center", marginTop: 8 }, secondaryText: { color: ACCENT, fontSize: 13, fontWeight: "700" }, footnote: { color: "#64748B", fontSize: 11, lineHeight: 16, marginTop: 12 },
});
