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
type SocialSection = "Feed" | "Collabo" | "Investors" | "Grants" | "Crowdfund";

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
type FeedPost = { id: string; name: string; tag: string; text: string; createdAt?: string; authorId?: string };

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
  const [socialSection, setSocialSection] = useState<SocialSection>("Feed");
  const [notice, setNotice] = useState("");
  const [apps, setApps] = useState<StoreApp[]>(sampleApps);
  const [posts, setPosts] = useState<FeedPost[]>(samplePosts);
  const [catalogueLoading, setCatalogueLoading] = useState(false);
  const [catalogueSource, setCatalogueSource] = useState<"preview" | "live">("preview");
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedSource, setFeedSource] = useState<"preview" | "live">("preview");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [postDraft, setPostDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const [likedPostIds, setLikedPostIds] = useState<string[]>([]);
  const [openCommentsPostId, setOpenCommentsPostId] = useState<string | null>(null);
  const [commentsByPost, setCommentsByPost] = useState<Record<string, { id: string; name: string; body: string; createdAt: string }[]>>({});
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentLoadingPostId, setCommentLoadingPostId] = useState<string | null>(null);
  const [commentSendingPostId, setCommentSendingPostId] = useState<string | null>(null);
  const [connectingPostIds, setConnectingPostIds] = useState<string[]>([]);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setUserEmail(data.session?.user.email ?? null);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user.email ?? null);
    });
    const handleUrl = async (url: string) => {
      try {
        const callback = new URL(url);
        const code = callback.searchParams.get("code");
        if (code && callback.protocol === "mw.wealthgrid.mas:") {
          setAuthLoading(true);
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) showNotice(error.message);
          else showNotice("You are signed in to MAS.");
          setAuthLoading(false);
        }
      } catch {
        setAuthLoading(false);
      }
    };
    Linking.getInitialURL().then((url) => { if (url) void handleUrl(url); });
    const urlSubscription = Linking.addEventListener("url", ({ url }) => { void handleUrl(url); });
    return () => {
      active = false;
      authListener.subscription.unsubscribe();
      urlSubscription.remove();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!isSupabaseConfigured) return () => { active = false; };
    setCatalogueLoading(true);
    Promise.resolve(
      supabase
      .from("listings")
      .select("id,slug,name,tagline,description,category,kind,downloads,rating_avg")
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100),
    ).then(({ data, error }) => {
        if (!active) return;
        if (!error && data?.length) {
          setCatalogueSource("live");
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
    Promise.resolve(
      supabase
      .from("social_posts")
      .select("id,author_id,body,created_at")
      .order("created_at", { ascending: false })
      .limit(30),
    ).then(async ({ data, error }) => {
        if (!active) return;
        if (!error && data?.length) {
          const ids = [...new Set(data.map((post: any) => post.author_id))];
          const { data: profiles } = await supabase
            .from("public_profiles")
            .select("id,display_name,developer_name")
            .in("id", ids);
          const names = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.developer_name || profile.display_name || "MAS member"]));
          if (active) setFeedSource("live");
          if (active) setPosts(data.map((post: any) => ({
            id: post.id,
            authorId: post.author_id,
            name: String(names.get(post.author_id) || "MAS member"),
            tag: new Date(post.created_at).toLocaleDateString(),
            text: post.body,
            createdAt: post.created_at,
          })));
          const { data: reactionRows } = await supabase.from("social_post_reactions").select("post_id,user_id").in("post_id", data.map((post: any) => post.id));
          if (active && reactionRows) {
            const counts: Record<string, number> = {};
            reactionRows.forEach((reaction: any) => { counts[reaction.post_id] = (counts[reaction.post_id] ?? 0) + 1; });
            setReactionCounts(counts);
            const { data: currentUser } = await supabase.auth.getUser();
            if (currentUser.user) setLikedPostIds(reactionRows.filter((reaction: any) => reaction.user_id === currentUser.user?.id).map((reaction: any) => reaction.post_id));
          }
        }
        if (active) setFeedLoading(false);
      })
      .catch(() => { if (active) setFeedLoading(false); });
    return () => { active = false; };
  }, []);

  const toggleLike = async (postId: string) => {
    if (!isSupabaseConfigured) { showNotice("Live reactions need Supabase configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in from Profile to react to posts."); setTab("Profile"); return; }
    const alreadyLiked = likedPostIds.includes(postId);
    if (alreadyLiked) {
      const { error } = await supabase.from("social_post_reactions").delete().eq("post_id", postId).eq("user_id", authData.user.id);
      if (error) { showNotice(error.message || "Could not remove reaction."); return; }
      setLikedPostIds((current) => current.filter((id) => id !== postId));
      setReactionCounts((current) => ({ ...current, [postId]: Math.max(0, (current[postId] ?? 1) - 1) }));
      return;
    }
    const { error } = await supabase.from("social_post_reactions").insert({ post_id: postId, user_id: authData.user.id });
    if (error) { showNotice(error.code === "23505" ? "You have already liked this post." : error.message || "Could not react to post."); return; }
    setLikedPostIds((current) => [...current, postId]);
    setReactionCounts((current) => ({ ...current, [postId]: (current[postId] ?? 0) + 1 }));
  };

  const requestConnection = async (recipientId?: string, postId?: string) => {
    if (!recipientId || !postId) { showNotice("This preview post has no member profile to connect with yet."); return; }
    if (!isSupabaseConfigured) { showNotice("Connections need Supabase configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in from Profile to connect with members."); setTab("Profile"); return; }
    if (authData.user.id === recipientId) { showNotice("That is your own post."); return; }
    setConnectingPostIds((current) => [...current, postId]);
    const { error } = await supabase.from("social_connections").insert({ requester_id: authData.user.id, recipient_id: recipientId, status: "pending" });
    setConnectingPostIds((current) => current.filter((id) => id !== postId));
    if (error) { showNotice(error.code === "23505" ? "A connection request already exists." : error.message || "Could not send connection request."); return; }
    showNotice("Connection request sent.");
  };

  const toggleComments = async (postId: string) => {
    if (openCommentsPostId === postId) { setOpenCommentsPostId(null); return; }
    setOpenCommentsPostId(postId);
    if (commentsByPost[postId] || !isSupabaseConfigured) return;
    setCommentLoadingPostId(postId);
    const { data, error } = await supabase.from("social_post_comments").select("id,author_id,body,created_at").eq("post_id", postId).order("created_at", { ascending: true }).limit(100);
    if (error) { showNotice(error.message || "Could not load comments."); setCommentLoadingPostId(null); return; }
    const authorIds = [...new Set((data ?? []).map((item: any) => item.author_id))];
    const { data: profiles } = authorIds.length ? await supabase.from("public_profiles").select("id,display_name,developer_name").in("id", authorIds) : { data: [] as any[] };
    const names = new Map((profiles ?? []).map((profile: any) => [profile.id, profile.developer_name || profile.display_name || "MAS member"]));
    setCommentsByPost((current) => ({ ...current, [postId]: (data ?? []).map((item: any) => ({ id: item.id, name: String(names.get(item.author_id) || "MAS member"), body: item.body, createdAt: item.created_at })) }));
    setCommentLoadingPostId(null);
  };

  const sendComment = async (postId: string) => {
    const body = (commentDrafts[postId] ?? "").trim();
    if (!body) return;
    if (!isSupabaseConfigured) { showNotice("Live comments need Supabase configuration."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { showNotice("Sign in from Profile to comment."); setTab("Profile"); return; }
    setCommentSendingPostId(postId);
    const { data, error } = await supabase.from("social_post_comments").insert({ post_id: postId, author_id: authData.user.id, body }).select("id,created_at").single();
    if (error || !data) { setCommentSendingPostId(null); showNotice(error?.message || "Your comment could not be sent."); return; }
    setCommentsByPost((current) => ({ ...current, [postId]: [...(current[postId] ?? []), { id: data.id, name: authData.user.email || "You", body, createdAt: data.created_at }] }));
    setCommentDrafts((current) => ({ ...current, [postId]: "" }));
    setCommentSendingPostId(null);
    showNotice("Comment added.");
  };

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
                <Text style={styles.sectionMeta}>{catalogueLoading ? "SYNCING" : catalogueSource === "live" ? "MAS CATALOGUE" : "PREVIEW MODE"}</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {["All", "Education", "Business", "Finance"].map((item) => (
                  <TouchableOpacity key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipActive]}>
                    <Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {catalogueLoading && apps === sampleApps ? <ActivityIndicator color={COLORS.accent} style={{ marginVertical: 16 }} /> : null}
              {filteredApps.length ? filteredApps.map((app) => (
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
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {(["Feed", "Collabo", "Investors", "Grants", "Crowdfund"] as SocialSection[]).map((item) => (
                  <TouchableOpacity key={item} onPress={() => setSocialSection(item)} style={[styles.chip, socialSection === item && styles.chipActive]}>
                    <Text style={[styles.chipText, socialSection === item && styles.chipTextActive]}>{item}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              {socialSection === "Feed" ? (
                <>
                  <View style={styles.composeCard}>
                    <Text style={styles.composePrompt}>Share an idea with the community…</Text>
                    <TextInput accessibilityLabel="Write a Social post" placeholder="What are you building or thinking about?" placeholderTextColor={COLORS.muted} value={postDraft} onChangeText={setPostDraft} multiline maxLength={2000} style={styles.postComposerInput} />
                    <View style={styles.composeFooter}><Text style={styles.composeLimit}>{postDraft.length}/2000</Text><TouchableOpacity disabled={posting || !postDraft.trim()} style={[styles.composeButton, (posting || !postDraft.trim()) && { opacity: 0.5 }]} onPress={async () => {
                      if (!isSupabaseConfigured) { showNotice("Live posting is unavailable until Supabase is configured."); return; }
                      setPosting(true);
                      const { data: authData, error: authError } = await supabase.auth.getUser();
                      if (authError || !authData.user) { setPosting(false); showNotice("Sign in from Profile before publishing a post."); setTab("Profile"); return; }
                      const body = postDraft.trim();
                      const { data, error } = await supabase.from("social_posts").insert({ body, author_id: authData.user.id }).select("id,created_at").single();
                      if (error || !data) { setPosting(false); showNotice(error?.message || "Your post could not be published."); return; }
                      setPosts((current) => [{ id: data.id, authorId: authData.user.id, name: authData.user.email || "You", tag: new Date(data.created_at || Date.now()).toLocaleDateString(), text: body, createdAt: data.created_at }, ...current]);
                      setFeedSource("live");
                      setPostDraft("");
                      setPosting(false);
                      showNotice("Your post is live on MAS Social.");
                    }}><Text style={styles.composeButtonText}>{posting ? "Publishing…" : "Publish post"}</Text></TouchableOpacity></View>
                  </View>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>Community feed</Text><Text style={styles.sectionMeta}>{feedLoading ? "SYNCING" : feedSource === "live" ? "MAS SOCIAL" : "PREVIEW MODE"}</Text></View>
                  {posts.map((post) => (
                    <View key={post.id || post.name} style={styles.postCard}>
                      <View style={styles.postHeader}><View style={styles.smallAvatar}><Text style={styles.smallAvatarText}>{post.name.charAt(0)}</Text></View><View style={styles.postIdentity}><Text style={styles.postName}>{post.name}</Text><Text style={styles.postTag}>{post.tag}</Text></View></View>
                      <Text style={styles.postText}>{post.text}</Text>
                      <View style={styles.postActions}><TouchableOpacity onPress={() => void toggleLike(post.id)}><Text style={[styles.postAction, likedPostIds.includes(post.id) && { color: COLORS.accent }]}>{likedPostIds.includes(post.id) ? "♥ Liked" : "♡ Like"}{reactionCounts[post.id] ? ` · ${reactionCounts[post.id]}` : ""}</Text></TouchableOpacity><TouchableOpacity onPress={() => void toggleComments(post.id)}><Text style={styles.postAction}>○ Comment{commentsByPost[post.id]?.length ? ` · ${commentsByPost[post.id].length}` : ""}</Text></TouchableOpacity><TouchableOpacity disabled={connectingPostIds.includes(post.id)} onPress={() => void requestConnection(post.authorId, post.id)}><Text style={styles.postAction}>{connectingPostIds.includes(post.id) ? "Sending…" : "↗ Connect"}</Text></TouchableOpacity></View>{openCommentsPostId === post.id ? <View style={styles.commentsPanel}>{commentLoadingPostId === post.id ? <ActivityIndicator color={COLORS.accent} /> : (commentsByPost[post.id] ?? []).map((comment) => <View key={comment.id} style={styles.commentItem}><Text style={styles.commentAuthor}>{comment.name}</Text><Text style={styles.commentBody}>{comment.body}</Text></View>)}<TextInput accessibilityLabel="Write a comment" placeholder="Write a comment…" placeholderTextColor={COLORS.muted} value={commentDrafts[post.id] ?? ""} onChangeText={(value) => setCommentDrafts((current) => ({ ...current, [post.id]: value.slice(0, 1000) }))} multiline maxLength={1000} style={styles.commentInput} /><TouchableOpacity disabled={commentSendingPostId === post.id || !(commentDrafts[post.id] ?? "").trim()} style={[styles.composeButton, { alignSelf: "flex-end", marginTop: 8 }, (commentSendingPostId === post.id || !(commentDrafts[post.id] ?? "").trim()) && { opacity: 0.5 }]} onPress={() => void sendComment(post.id)}><Text style={styles.composeButtonText}>{commentSendingPostId === post.id ? "Sending…" : "Send comment"}</Text></TouchableOpacity></View> : null}
                    </View>
                  ))}
                </>
              ) : (
                <>
                  <View style={styles.sectionHeading}><Text style={styles.sectionTitle}>{socialSection}</Text><Text style={styles.sectionMeta}>DEMO CONTENT</Text></View>
                  {({
                    Collabo: [
                      ["Build Malawi", "Looking for React Native and backend developers", "Technology · Collaboration"],
                      ["Campus Innovators", "Seeking a designer and product researcher", "Education · Team building"],
                      ["Open Source Malawi", "Join a community project solving local problems", "Open source · Community"],
                    ],
                    Investors: [
                      ["Early-stage technology", "Connect with founders building scalable digital products", "Investor network · Preview"],
                      ["Startup pitch room", "Prepare a short pitch and find potential mentors", "Mentorship · Preview"],
                    ],
                    Grants: [
                      ["Youth innovation funding", "Explore support opportunities for youth-led ideas", "Grant discovery · Preview"],
                      ["Digital skills initiative", "Find programmes supporting technology education", "Skills · Preview"],
                    ],
                    Crowdfund: [
                      ["Community project", "Showcase a local problem and rally community support", "Crowdfunding · Preview"],
                      ["Launch your MVP", "Share a project goal and build an early supporter base", "Startup · Preview"],
                    ],
                  } as Record<Exclude<SocialSection, "Feed">, string[][]>)[socialSection].map(([title, description, meta]) => (
                    <TouchableOpacity key={title} style={styles.toolCard} onPress={() => void Linking.openURL("https://malawian-app-store-j6pm.vercel.app/console/social")}>
                      <View style={styles.toolIcon}><Text style={styles.toolIconText}>{socialSection === "Collabo" ? "↗" : socialSection === "Investors" ? "◇" : socialSection === "Grants" ? "▤" : "＋"}</Text></View>
                      <View style={styles.toolCopy}><Text style={styles.toolTitle}>{title}</Text><Text style={styles.toolDescription}>{description}</Text><Text style={styles.postTag}>{meta}</Text></View>
                      <Text style={styles.chevron}>›</Text>
                    </TouchableOpacity>
                  ))}
                  <Text style={styles.disclaimer}>Preview opportunities only. Real applications, funding offers and transactions require verified integrations.</Text>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => void Linking.openURL("https://malawian-app-store-j6pm.vercel.app/console/social")}><Text style={styles.secondaryButtonText}>Open full MAS Social →</Text></TouchableOpacity>
                </>
              )}
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
                <TouchableOpacity key={title} style={styles.toolCard} onPress={() => void Linking.openURL(title === "My applications" ? "https://malawian-app-store-j6pm.vercel.app/console/manage" : title === "Developer wallet" ? "https://malawian-app-store-j6pm.vercel.app/console/wallet" : "https://malawian-app-store-j6pm.vercel.app/console/social")}>
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
              <View style={styles.profileCard}><View style={styles.profileAvatar}><Text style={styles.profileAvatarText}>{userEmail ? userEmail.charAt(0).toUpperCase() : "V"}</Text></View><Text style={styles.profileName}>{userEmail ? "You're signed in" : "Your MAS account"}</Text><Text style={styles.profileHint}>{userEmail || (isSupabaseConfigured ? "Sign in securely with your Google account to connect your MAS profile." : "Add the public Supabase URL and publishable key to enable account sign-in.")}</Text>{userEmail ? <TouchableOpacity style={styles.primaryButton} onPress={() => { void supabase.auth.signOut().then(({ error }) => error ? showNotice(error.message) : showNotice("Signed out.")); }}><Text style={styles.primaryButtonText}>Sign out</Text></TouchableOpacity> : <TouchableOpacity disabled={!isSupabaseConfigured || authLoading} style={[styles.primaryButton, (!isSupabaseConfigured || authLoading) && { opacity: 0.55 }]} onPress={async () => { if (!isSupabaseConfigured) return; setAuthLoading(true); const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "mw.wealthgrid.mas://auth/callback", skipBrowserRedirect: true } }); if (error) { showNotice(error.message); setAuthLoading(false); return; } if (data.url) { try { await Linking.openURL(data.url); } catch { showNotice("Could not open Google sign-in."); setAuthLoading(false); } } else { showNotice("Google sign-in URL was not returned."); setAuthLoading(false); } }}><Text style={styles.primaryButtonText}>{authLoading ? "Connecting…" : "Continue with Google"}</Text></TouchableOpacity>}</View>
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
  postComposerInput: { minHeight: 82, maxHeight: 180, marginTop: 12, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, color: COLORS.text, fontSize: 13, lineHeight: 19, textAlignVertical: "top" },
  composeFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 10 },
  composeLimit: { color: COLORS.muted, fontSize: 10 },
  composeButton: { backgroundColor: COLORS.accent, paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8 },
  composeButtonText: { color: "#FFFFFF", fontSize: 11, fontWeight: "800" },
  postCard: { padding: 15, borderRadius: 14, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border, marginBottom: 12 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  smallAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accentSoft, alignItems: "center", justifyContent: "center" },
  smallAvatarText: { color: "#DAD5FF", fontWeight: "900" },
  postIdentity: { flex: 1 },
  postName: { color: COLORS.text, fontSize: 13, fontWeight: "800" },
  postTag: { color: COLORS.muted, fontSize: 10, marginTop: 3 },
  postText: { color: "#D6DCEC", fontSize: 13, lineHeight: 20, marginTop: 14 },
  postActions: { flexDirection: "row", justifyContent: "space-between", marginTop: 16, paddingTop: 13, borderTopWidth: 1, borderTopColor: COLORS.border },
  commentsPanel: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: COLORS.border },
  commentItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  commentAuthor: { color: COLORS.text, fontSize: 11, fontWeight: "800" },
  commentBody: { color: "#D6DCEC", fontSize: 12, lineHeight: 18, marginTop: 3 },
  commentInput: { minHeight: 44, maxHeight: 100, marginTop: 10, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.background, color: COLORS.text, fontSize: 12, textAlignVertical: "top" },
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