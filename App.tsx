import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  ActivityIndicator,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { supabase, isSupabaseConfigured } from "./src/lib/supabase";

type Tab = "Explore" | "Social" | "Develop" | "Profile";

const COLORS = {
  background: "#0B1020",
  surface: "#131B30",
  surfaceAlt: "#19233D",
  border: "#263451",
  text: "#F4F6FC",
  muted: "#A7B2C9",
  accent: "#8C7CFF",
  accentSoft: "#25234C",
  green: "#51D6A4",
};

type StoreApp = { id: string; name: string; category: string; description: string; mark: string; color: string; slug?: string; kind?: string; developer?: string; downloads?: number; rating?: number; };
type FeedPost = { id: string; name: string; tag: string; text: string; createdAt?: string };

const sampleApps: StoreApp[] = [
  { id: "sample-redbot", name: "RedBot", category: "Education", description: "Explore Malawian laws with an AI learning assistant.", mark: "R", color: "#D84D55" },
  { id: "sample-malawi-market", name: "Malawi Market", category: "Business", description: "Discover local products and growing businesses.", mark: "M", color: "#2B9D80" },
  { id: "sample-cloud-pay", name: "Cloud Pay", category: "Finance", description: "A future-ready digital payments experience.", mark: "C", color: "#4C82E8" },
];

const samplePosts: FeedPost[] = [
  { id: "sample-mas-community", name: "MAS Community", tag: "Community update", text: "Welcome to the native MAS community. Connect with builders, share ideas and discover projects across Malawi." },
  { id: "sample-startup-circle", name: "Startup Circle Malawi", tag: "Collaboration", text: "What problem in your community would you love to solve with technology? Share your idea and find collaborators." },
];

export default function App() {
  const [tab, setTab] = useState<Tab>("Explore");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [notice, setNotice] = useState("");
  const [apps, setApps] = useState<StoreApp[]>(sampleApps);
  const [posts, setPosts] = useState<FeedPost[]>(samplePosts);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) return () => { active = false; };
    setCatalogueLoading(true);
    supabase
      .from("listings")
      .select("id,slug,name,tagline,description,category,kind,downloads,rating_avg")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!active) return;
        if (!error && data?.length) {
          setApps(data.map((item: any) => ({
            id: item.id,
            name: item.name,
            category: item.category || "Other",
            description: item.tagline || item.description || "Discover this project on MAS.",
            mark: String(item.name || "M").slice(0, 1).toUpperCase(),
            color: COLORS.accent,
            slug: item.slug,
            kind: item.kind,
            downloads: item.downloads ?? 0,
            rating: item.rating_avg ?? 0,
          })));
        }
        setCatalogueLoading(false);
      })
      .catch(() => { if (active) setCatalogueLoading(false); });
    setFeedLoading(true);
    supabase
      .from("social_posts")
      .select("id,author_id,body,created_at")
      .order("created_at", { ascending: false })
      .limit(30)
      .then(async ({ data, error }) => {
        if (!active) return;
        if (!error && data?.length) {
          const ids = [...new Set(data.map((post: any) => post.author_id))];
          const { data: profiles } = await supabase
            .from("public_profiles")
            .select("id,display_name,developer_name")
            .in("id", ids);
          const names = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.developer_name || profile.display_name || "MAS member"]));
          if (active) setPosts(data.map((post: any) => ({
            id: post.id,
            name: String(names.get(post.author_id) || "MAS member"),
            tag: new Date(post.created_at).toLocaleDateString(),
            text: post.body,
            createdAt: post.created_at,
          })));
        }
        if (active) setFeedLoading(false);
      })
      .catch(() => { if (active) setFeedLoading(false); });
    return () => { active = false; };
  }, []);

  const filteredApps = useMemo(() => {
    const q = query.trim().toLowerCase();
    return apps.filter((app) => {
      const matchesQuery = !q || `${app.name} ${app.category} ${app.description}`.toLowerCase().includes(q);
      const matchesCategory = category === "All" || app.category === category;
      return matchesQuery && matchesCategory;
    });
  }, [apps, query, category]);

  const showNotice = (message: string) => {
    setNotice(message);
    setTimeout(() => setNotice(""), 2800);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <ExpoStatusBar style="light" />
      <StatusBar barStyle="light-content" backgroundColor={COLORS.background} />
      <View style={styles.app}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><Text style={styles.brandMarkText}>M</Text></View>
            <View>
              <Text style={styles.brand}>MAS</Text>
              <Text style={styles.brandSub}>MALAWIAN APP STORE</Text>
            </View>
          </View>
          <TouchableOpacity accessibilityRole="button" style={styles.avatar} onPress={() => setTab("Profile")}>
            <Text style={styles.avatarText}>V</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
          {tab === "Explore" && (
            <>
              <View style={styles.hero}>
                <Text style={styles.eyebrow}>BUILT FOR WHAT'S NEXT</Text>
                <Text style={styles.heroTitle}>Discover what's{"\n"}being built in Malawi.</Text>
                <Text style={styles.heroText}>Find useful apps, meet local builders and bring your next idea to life.</Text>
                <View style={styles.searchBox}>
                  <Text style={styles.searchIcon}>⌕</Text>
                  <TextInput
                    accessibilityLabel="Search apps"
                    placeholder="Search apps and categories"
                    placeholderTextColor={COLORS.muted}
                    value={query}
                    onChangeText={setQuery}
                    style={styles.searchInput}
                    returnKeyType="search"
                  />
                </View>
              </View>

              <View style={styles.sectionHeading}>
                <Text style={styles.sectionTitle}>Explore apps</Text>
                <Text style={styles.sectionMeta}>{catalogueLoading ? "SYNCING" : isSupabaseConfigured ? "MAS CATALOGUE" : "PREVIEW MODE"}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {["All", "Education", "Business", "Finance"].map((item) => (
                  <TouchableOpacity key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipActive]}>
                    <Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {catalogueLoading && apps === sampleApps ? <ActivityIndicator color={COLORS.accent} style={{ marginVertical: 16 }} /> : null}\n              {filteredApps.length ? filteredApps.map((app) => (
                <TouchableOpacity key={app.id || app.name} style={styles.appCard} onPress={() => app.slug ? void Linking.openURL(`https://malawian-app-store-j6pm.vercel.app/apps/${encodeURIComponent(app.slug)}`) : showNotice(`${app.name} is sample content. Add Supabase public credentials to load the live catalogue.`)}>
                  <View style={[styles.appIcon, { backgroundColor: app.color }]}><Text style={styles.appIconText}>{app.mark}</Text></View>
                  <View style={styles.appDetails}>
                    <Text style={styles.appName}>{app.name}</Text>
                    <Text style={styles.appCategory}>{app.category}</Text>
                    <Text style={styles.appDescription}>{app.description}</Text>
                  </View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              )) : <Text style={styles.emptyText}>No apps match that search. Try another category or search term.</Text>}

              <View style={styles.infoBanner}>
                <Text style={styles.infoTitle}>Have an app idea?</Text>
                <Text style={styles.infoText}>Build, publish and grow with Malawi's developer community.</Text>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => setTab("Develop")}><Text style={styles.secondaryButtonText}>Explore developer tools  →</Text></TouchableOpacity>
              </View>
            </>
          )}

          {tab === "Social" && (
            <>
              <Text style={styles.pageTitle}>Social</Text>
              <Text style={styles.pageIntro}>Ideas, people and technology — connected.</Text>
              <TouchableOpacity style={styles.composeCard} onPress={() => showNotice("To publish or message, sign in on the MAS website. Native sign-in and posting are still being connected.")}>
                <Text style={styles.composePrompt}>Share an idea with the community…</Text>
                <Text style={styles.composeAction}>＋ Create post</Text>
              </TouchableOpacity>
              <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Community feed</Text><Text style={styles.sectionMeta}>SAMPLE PREVIEW</Text></View>
              {posts.map((post) => (
                <View key={post.id || post.name} style={styles.postCard}>
                  <View style={styles.postHeader}><View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{post.name.charAt(0)}</Text></View><View style={styles.postIdentity}><Text style={styles.postName}>{post.name}</Text><Text style={styles.postTag}>{post.tag}</Text></View></View>
                  <Text style={styles.postText}>{post.text}</Text>
                  <View style={styles.postActions}><TouchableOpacity onPress={() => showNotice("Sign in to MAS to like posts. Native reaction controls are still being connected.")}><Text style={styles.postAction}>♡ Like</Text></TouchableOpacity><TouchableOpacity onPress={() => showNotice("Sign in to MAS to comment. Native comments are still being connected.")}><Text style={styles.postAction}>○ Comment</Text></TouchableOpacity><TouchableOpacity onPress={() => showNotice("Messaging will be enabled after native account authentication is complete.")}><Text style={styles.postAction}>↗ Connect</Text></TouchableOpacity></View>
                </View>
              ))}
            </>
          )}

          {tab === "Develop" && (
            <>
              <Text style={styles.pageTitle}>Developer space</Text>
              <Text style={styles.pageIntro}>Tools for people building the next generation of Malawian technology.</Text>
              <View style={styles.developerStatus}><View style={styles.statusDot}/><Text style={styles.statusText}>Native app foundation started</Text></View>
              {[
                ["▣", "My applications", "Prepare listings and manage app releases."],
                ["↗", "Collaboration", "Find teammates and projects to build together."],
                ["◇", "Investors & grants", "Discover funding opportunities and support."],
                ["▤", "Developer wallet", "A future connected view of verified ledger records."],
              ].map(([icon, title, description]) => (
                <TouchableOpacity key={title} style={styles.toolCard} onPress={() => showNotice(`${title} will be connected to the live MAS backend.`)}>
                  <View style={styles.toolIcon}><Text style={styles.toolIconText}>{icon}</Text></View>
                  <View style={styles.toolCopy}><Text style={styles.toolTitle}>{title}</Text><Text style={styles.toolDescription}>{description}</Text></View>
                  <Text style={styles.chevron}>›</Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.disclaimer}>These are native interface previews. Live account data and transactions are not connected yet.</Text>
            </>
          )}

          {tab === "Profile" && (
            <>
              <Text style={styles.pageTitle}>Your MAS profile</Text>
              <Text style={styles.pageIntro}>Your account, apps and community activity in one place.</Text>
              <View style={styles.profileCard}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>V</Text></View><Text style={styles.profileName}>Welcome to MAS</Text><Text style={styles.profileHint}>Sign-in and profile details will be connected to Supabase next.</Text><TouchableOpacity style={styles.primaryButton} onPress={() => showNotice("Authentication is the next integration milestone.")}><Text style={styles.primaryButtonText}>Connect account</Text></TouchableOpacity></View>
              <View style={styles.infoBanner}><Text style={styles.infoTitle}>Built for Malawi</Text><Text style={styles.infoText}>Discover apps, collaborate with builders and grow local technology.</Text></View>
            </>
          )}
          <View style={styles.bottomSpace}/>
        </ScrollView>

        {notice ? <View accessibilityLiveRegion="polite" style={styles.toast}><Text style={styles.toastText}>{notice}</Text></View> : null}

        <View style={styles.tabBar}>
          {([
            ["Explore", "⌂"],
            ["Social", "◎"],
            ["Develop", "▦"],
            ["Profile", "○"],
          ] as [Tab, string][]).map(([name, icon]) => (
            <TouchableOpacity key={name} accessibilityRole="tab" accessibilityState={{ selected: tab === name }} style={styles.tabItem} onPress={() => setTab(name)}>
              <Text style={[styles.tabIcon, tab === name && styles.tabActive]}>{icon}</Text>
              <Text style={[styles.tabLabel, tab === name && styles.tabLabelActive]}>{name}</Text>
              {tab === name ? <View style={styles.tabIndicator}/> : null}
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.background },
  app: { flex: 1, backgroundColor: COLORS.background },
  header: { minHeight: 68, paddingHorizontal: 20, paddingVertical: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: COLORS.border },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 11, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center" },
  brandMarkText: { color: "#FFFFFF", fontSize: 21, fontWeight: "900" },
  brand: { color: COLORS.text, fontWeight: "900", fontSize: 17, letterSpacing: 1.4 },
  brandSub: { color: COLORS.muted, fontSize: 8, fontWeight: "700", letterSpacing: 1.3, marginTop: 2 },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surfaceAlt, alignItems: "center", justifyContent: "center" },
  avatarText: { color: COLORS.text, fontWeight: "800" },
  content: { flex: 1 },
  contentInner: { paddingHorizontal: 18, paddingTop: 18 },
  hero: { padding: 20, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  eyebrow: { color: COLORS.green, fontSize: 10, fontWeight: "800", letterSpacing: 1.7, marginBottom: 12 },
  heroTitle: { color: COLORS.text, fontSize: 29, lineHeight: 35, fontWeight: "900", letterSpacing: -0.7 },
  heroText: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginTop: 10, marginBottom: 18 },
  searchBox: { minHeight: 48, flexDirection: "row", alignItems: "center", paddingHorizontal: 13, backgroundColor: COLORS.background, borderRadius: 11, borderWidth: 1, borderColor: COLORS.border },
  searchIcon: { color: COLORS.muted, fontSize: 25, marginRight: 8 },
  searchInput: { flex: 1, color: COLORS.text, fontSize: 13, paddingVertical: 10 },
  sectionHeading: { marginTop: 25, marginBottom: 13, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { color: COLORS.text, fontSize: 18, fontWeight: "800" },
  sectionMeta: { color: COLORS.muted, fontSize: 9, fontWeight: "800", letterSpacing: 1.1 },
  chips: { gap: 8, paddingBottom: 15 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  chipActive: { borderColor: COLORS.accent, backgroundColor: COLORS.accentSoft },
  chipText: { color: COLORS.muted, fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: "#DAD5FF" },
  appCard: { flexDirection: "row", alignItems: "center", padding: 13, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, marginBottom: 10, gap: 12 },
  appIcon: { width: 53, height: 53, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  appIconText: { color: "#FFFFFF", fontSize: 24, fontWeight: "900" },
  appDetails: { flex: 1 },
  appName: { color: COLORS.text, fontWeight: "800", fontSize: 14 },
  appCategory: { color: COLORS.accent, fontSize: 10, fontWeight: "800", marginTop: 3 },
  appDescription: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 5 },
  chevron: { color: COLORS.muted, fontSize: 25, paddingHorizontal: 2 },
  emptyText: { color: COLORS.muted, padding: 18, textAlign: "center" },
  infoBanner: { padding: 17, marginTop: 15, backgroundColor: COLORS.accentSoft, borderWidth: 1, borderColor: "#3C3970", borderRadius: 15 },
  infoTitle: { color: COLORS.text, fontWeight: "800", fontSize: 15 },
  infoText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  secondaryButton: { alignSelf: "flex-start", marginTop: 13, paddingVertical: 8 },
  secondaryButtonText: { color: "#DAD5FF", fontSize: 12, fontWeight: "800" },
  pageTitle: { color: COLORS.text, fontSize: 28, fontWeight: "900", letterSpacing: -0.5, marginTop: 7 },
  pageIntro: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginTop: 7, marginBottom: 20 },
  composeCard: { padding: 16, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: 8 },
  composePrompt: { color: COLORS.muted, fontSize: 13 },
  composeAction: { color: "#DAD5FF", fontSize: 12, fontWeight: "800", marginTop: 14 },
  postCard: { padding: 15, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  smallAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accentSoft, alignItems: "center", justifyContent: "center" },
  smallAvatarText: { color: "#DAD5FF", fontWeight: "900" },
  postIdentity: { flex: 1 },
  postName: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  postTag: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  postText: { color: "#D6DCEC", fontSize: 13, lineHeight: 20, marginTop: 14 },
  postActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, paddingTop: 13, borderTopWidth: 1, borderTopColor: COLORS.border },
  postAction: { color: COLORS.muted, fontSize: 11, fontWeight: "700" },
  developerStatus: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderWidth: 1, borderColor: "#275342", backgroundColor: "#102A27", borderRadius: 10, marginBottom: 15 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: COLORS.green },
  statusText: { color: COLORS.green, fontSize: 11, fontWeight: "700" },
  toolCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface, borderRadius: 13, marginBottom: 10 },
  toolIcon: { width: 43, height: 43, alignItems: "center", justifyContent: "center", borderRadius: 12, backgroundColor: COLORS.accentSoft },
  toolIconText: { color: "#DAD5FF", fontSize: 20, fontWeight: "800" },
  toolCopy: { flex: 1 },
  toolTitle: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  toolDescription: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 4 },
  disclaimer: { color: COLORS.muted, fontSize: 10, lineHeight: 16, marginTop: 12 },
  profileCard: { alignItems: "center", padding: 24, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface },
  profileAvatar: { width: 66, height: 66, borderRadius: 33, backgroundColor: COLORS.accent, alignItems: "center", justifyContent: "center" },
  profileAvatarText: { color: "#FFFFFF", fontSize: 26, fontWeight: "900" },
  profileName: { color: COLORS.text, fontSize: 17, fontWeight: "800", marginTop: 14 },
  profileHint: { color: COLORS.muted, textAlign: "center", fontSize: 12, lineHeight: 18, marginTop: 7 },
  primaryButton: { marginTop: 18, backgroundColor: COLORS.accent, borderRadius: 11, paddingHorizontal: 24, paddingVertical: 12 },
  primaryButtonText: { color: "#FFFFFF", fontWeight: "800", fontSize: 12 },
  bottomSpace: { height: 22 },
  tabBar: { flexDirection: "row", backgroundColor: "#0D1426", borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8, paddingBottom: 6 },
  tabItem: { flex: 1, alignItems: "center", justifyContent: "center", minHeight: 48, gap: 3 },
  tabIcon: { color: COLORS.muted, fontSize: 20, lineHeight: 22 },
  tabActive: { color: "#DAD5FF" },
  tabLabel: { color: COLORS.muted, fontSize: 9, fontWeight: "700" },
  tabLabelActive: { color: "#DAD5FF" },
  tabIndicator: { position: "absolute", top: -8, width: 22, height: 2, borderRadius: 1, backgroundColor: COLORS.accent },
  toast: { position: "absolute", bottom: 72, left: 18, right: 18, padding: 13, borderRadius: 10, backgroundColor: "#252E47", borderWidth: 1, borderColor: COLORS.border },
  toastText: { color: COLORS.text, fontSize: 12, textAlign: "center" },
});