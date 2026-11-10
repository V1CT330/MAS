import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type Post = { id: string; author_id: string; body: string; created_at: string; media_url?: string | null; media_type?: string | null };
type Profile = { id: string; display_name: string | null; developer_name: string | null; bio?: string | null; avatar_url?: string | null };
type Comment = { id: string; post_id: string; author_id: string; body: string; created_at: string };
type Reaction = { post_id: string; user_id: string };
type SelectedImage = { uri: string; base64: string; mimeType: string; fileName: string | null; fileSize: number | null };
const BLUE = "#1877F2";

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export default function SocialScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [avatarUrls, setAvatarUrls] = useState<Record<string, string>>({});
  const [selectedImage, setSelectedImage] = useState<SelectedImage | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [draft, setDraft] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [commentPostId, setCommentPostId] = useState<string | null>(null);
  const [profileToShow, setProfileToShow] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    if (!isSupabaseConfigured) { setUserId(null); setLoading(false); setError("Configure the public MAS Supabase client to load Social."); return; }
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) { setUserId(null); setPosts([]); setLoading(false); setError("Sign in to your MAS account to use Social."); return; }
    const me = auth.user.id; setUserId(me);
    const { data: postRows, error: postError } = await supabase.from("social_posts").select("id,author_id,body,created_at,media_url,media_type").order("created_at", { ascending: false }).limit(50);
    if (postError) { setError(postError.message); setLoading(false); return; }
    const postList = (postRows ?? []) as Post[]; setPosts(postList);
    const postIds = postList.map((post) => post.id);
    const authorIds = [...new Set(postList.map((post) => post.author_id))];
    if (!postIds.length) { setProfiles({}); setAvatarUrls({}); setComments([]); setReactions([]); setLoading(false); return; }
    const [commentResult, reactionResult] = await Promise.all([
      supabase.from("social_post_comments").select("id,post_id,author_id,body,created_at").in("post_id", postIds).order("created_at", { ascending: true }).limit(300),
      supabase.from("social_post_reactions").select("post_id,user_id").in("post_id", postIds),
    ]);
    const profileIds = [...new Set([...authorIds, ...((commentResult.data ?? []) as Comment[]).map((row) => row.author_id)])];
    const profileResult = profileIds.length
      ? await supabase.from("public_profiles").select("id,display_name,developer_name,bio,avatar_url").in("id", profileIds)
      : { data: [], error: null };
    const profileMap: Record<string, Profile> = {};
    for (const profile of (profileResult.data ?? []) as Profile[]) profileMap[profile.id] = profile;
    setProfiles(profileMap);
    if (profileResult.error) setError(profileResult.error.message);
    if (commentResult.error) setError(commentResult.error.message); else setComments((commentResult.data ?? []) as Comment[]);
    if (reactionResult.error) setError(reactionResult.error.message); else setReactions((reactionResult.data ?? []) as Reaction[]);
    const signedAvatars = await Promise.all(Object.values(profileMap).map(async (profile) => {
      if (!profile.avatar_url) return null;
      if (/^https:\/\//i.test(profile.avatar_url)) return [profile.id, profile.avatar_url] as const;
      const { data } = await supabase.storage.from("app-assets").createSignedUrl(profile.avatar_url, 3600);
      return data?.signedUrl ? [profile.id, data.signedUrl] as const : null;
    }));
    setAvatarUrls(Object.fromEntries(signedAvatars.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const { data: listener } = supabase.auth.onAuthStateChange(() => { void load(); });
    return () => listener.subscription.unsubscribe();
  }, [load]);

  const submitPost = async () => {
    if (!userId) { setError("Sign in to publish a post."); return; }
    const body = draft.trim();
    if (!body || body.length > 2000) { setError("Posts must contain 1–2,000 characters."); return; }
    setBusy(true); setError("");
    let uploadedPath: string | null = null;
    try {
      let mediaUrl: string | null = null;
      let mediaType: "image" | null = null;
      if (selectedImage) {
        const extension = (selectedImage.fileName?.split(".").pop() || (selectedImage.mimeType === "image/png" ? "png" : "jpg")).toLowerCase().replace(/[^a-z0-9]/g, "");
        uploadedPath = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${extension || "jpg"}`;
        const { error: uploadError } = await supabase.storage.from("social-media").upload(uploadedPath, decodeBase64(selectedImage.base64), {
          cacheControl: "3600", contentType: selectedImage.mimeType, upsert: false,
        });
        if (uploadError) throw uploadError;
        mediaUrl = supabase.storage.from("social-media").getPublicUrl(uploadedPath).data.publicUrl;
        mediaType = "image";
      }
      const { error: insertError } = await supabase.from("social_posts").insert({
        author_id: userId, body, media_url: mediaUrl, media_type: mediaType,
      });
      if (insertError) throw insertError;
      setDraft(""); setSelectedImage(null); await load();
    } catch (cause) {
      if (uploadedPath) await supabase.storage.from("social-media").remove([uploadedPath]);
      setError(cause instanceof Error ? cause.message : "Could not publish your post.");
    } finally { setBusy(false); }
  };

  const chooseImage = async () => {
    setError("");
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError("Allow photo-library access to attach an image."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"], allowsEditing: false, quality: 0.85, base64: true,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (!asset.base64) { setError("Could not read the selected image. Choose another image."); return; }
    const mimeType = asset.mimeType || "image/jpeg";
    const estimatedBytes = Math.ceil(asset.base64.length * 3 / 4);
    if (!mimeType.startsWith("image/") || estimatedBytes > 10 * 1024 * 1024) {
      setError("Choose an image smaller than 10 MB."); return;
    }
    setSelectedImage({ uri: asset.uri, base64: asset.base64, mimeType, fileName: asset.fileName ?? null, fileSize: asset.fileSize ?? null });
  };

  const toggleLike = async (postId: string) => {
    if (!userId) return;
    setBusy(true); setError("");
    const liked = reactions.some((reaction) => reaction.post_id === postId && reaction.user_id === userId);
    const result = liked
      ? await supabase.from("social_post_reactions").delete().eq("post_id", postId).eq("user_id", userId)
      : await supabase.from("social_post_reactions").insert({ post_id: postId, user_id: userId });
    if (result.error) setError(result.error.message); else await load();
    setBusy(false);
  };

  const submitComment = async () => {
    if (!userId || !commentPostId) return;
    const body = commentDraft.trim();
    if (!body || body.length > 1000) { setError("Comments must contain 1–1,000 characters."); return; }
    setBusy(true); setError("");
    const { error: insertError } = await supabase.from("social_post_comments").insert({ post_id: commentPostId, author_id: userId, body });
    if (insertError) setError(insertError.message); else { setCommentDraft(""); setCommentPostId(null); await load(); }
    setBusy(false);
  };

  const commentsByPost = useMemo(() => {
    const result: Record<string, Comment[]> = {};
    for (const comment of comments) (result[comment.post_id] ??= []).push(comment);
    return result;
  }, [comments]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;
  if (!userId) return <View style={styles.root}><Text style={styles.heading}>MAS Social</Text><Text style={styles.body}>{error || "Sign in to access the community feed."}</Text><TouchableOpacity onPress={() => void load()} style={styles.secondaryButton}><Text style={styles.link}>Try again</Text></TouchableOpacity></View>;

  return <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.heading}>MAS Social</Text><Text style={styles.body}>Share updates and connect with the Malawian tech community.</Text>
    <View style={styles.composer}><Text style={styles.section}>Create a post</Text><TextInput value={draft} onChangeText={setDraft} maxLength={2000} multiline textAlignVertical="top" placeholder="What would you like to share?" style={styles.postInput} /><Text style={styles.counter}>{draft.length}/2000</Text>{selectedImage ? <View style={styles.selectedMedia}><Image source={{ uri: selectedImage.uri }} style={styles.selectedImage} resizeMode="cover" /><TouchableOpacity onPress={() => setSelectedImage(null)}><Text style={styles.removeMedia}>Remove image</Text></TouchableOpacity></View> : null}<View style={styles.composerActions}><TouchableOpacity disabled={busy} onPress={() => void chooseImage()} style={styles.attachButton}><Text style={styles.link}>＋ Add image</Text></TouchableOpacity><TouchableOpacity disabled={busy} onPress={() => void submitPost()} style={[styles.primaryButton, styles.postButton, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? "Posting…" : "Post"}</Text></TouchableOpacity></View></View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {posts.length === 0 ? <View style={styles.empty}><Text style={styles.body}>No posts yet. Start the conversation.</Text></View> : null}
    {posts.map((post) => {
      const author = profiles[post.author_id];
      const postComments = commentsByPost[post.id] ?? [];
      const liked = reactions.some((reaction) => reaction.post_id === post.id && reaction.user_id === userId);
      const likeCount = reactions.filter((reaction) => reaction.post_id === post.id).length;
      return <View key={post.id} style={styles.post}>
        <TouchableOpacity onPress={() => setProfileToShow(author ?? { id: post.author_id, display_name: null, developer_name: null })} style={styles.authorRow}>{avatarUrls[post.author_id] ? <Image source={{ uri: avatarUrls[post.author_id] }} style={styles.avatarImage} /> : <View style={styles.avatar}><Text style={styles.avatarText}>{(author?.display_name || author?.developer_name || "M").slice(0, 1).toUpperCase()}</Text></View>}<View><Text style={styles.author}>{author?.display_name || author?.developer_name || "MAS member"}</Text><Text style={styles.date}>{new Date(post.created_at).toLocaleString()}</Text></View></TouchableOpacity>
        <Text style={styles.postBody}>{post.body}</Text>
        {post.media_url && post.media_type === "image" ? <Image source={{ uri: post.media_url }} style={styles.postMedia} resizeMode="contain" /> : null}
        {post.media_url && post.media_type === "video" ? <Text style={styles.mediaNote}>Video attachment is not yet supported in the native feed.</Text> : null}
        <View style={styles.actions}><TouchableOpacity disabled={busy} onPress={() => void toggleLike(post.id)} style={styles.action}><Text style={[styles.actionText, liked && styles.liked]}>{liked ? "♥ Liked" : "♡ Like"} · {likeCount}</Text></TouchableOpacity><TouchableOpacity onPress={() => setCommentPostId(commentPostId === post.id ? null : post.id)} style={styles.action}><Text style={styles.actionText}>Comment · {postComments.length}</Text></TouchableOpacity></View>
        {postComments.slice(-3).map((comment) => <View key={comment.id} style={styles.comment}><Text style={styles.commentAuthor}>{profiles[comment.author_id]?.display_name || profiles[comment.author_id]?.developer_name || "MAS member"}</Text><Text style={styles.commentBody}>{comment.body}</Text></View>)}
        {commentPostId === post.id ? <View style={styles.commentComposer}><TextInput value={commentDraft} onChangeText={setCommentDraft} maxLength={1000} placeholder="Write a comment" style={styles.commentInput} /><TouchableOpacity disabled={busy} onPress={() => void submitComment()} style={styles.commentButton}><Text style={styles.primaryText}>Send</Text></TouchableOpacity></View> : null}
      </View>;
    })}
    <TouchableOpacity onPress={() => void load()} style={styles.refresh}><Text style={styles.link}>Refresh feed</Text></TouchableOpacity>
    <Modal visible={Boolean(profileToShow)} transparent animationType="slide" onRequestClose={() => setProfileToShow(null)}><View style={styles.modalScrim}><View style={styles.profileModal}><TouchableOpacity onPress={() => setProfileToShow(null)} style={styles.close}><Text style={styles.closeText}>×</Text></TouchableOpacity>{profileToShow && avatarUrls[profileToShow.id] ? <Image source={{ uri: avatarUrls[profileToShow.id] }} style={styles.avatarLarge} /> : <View style={styles.avatarLarge}><Text style={styles.avatarLargeText}>{(profileToShow?.display_name || profileToShow?.developer_name || "M").slice(0, 1).toUpperCase()}</Text></View>}<Text style={styles.section}>{profileToShow?.developer_name || profileToShow?.display_name || "MAS member"}</Text>{profileToShow?.bio ? <Text style={styles.body}>{profileToShow.bio}</Text> : <Text style={styles.body}>MAS community member.</Text>}</View></View></Modal>
  </ScrollView>;
}

const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#F6F7FB" }, content: { padding: 16, paddingBottom: 30 }, center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F6F7FB" }, heading: { color: "#111827", fontSize: 24, fontWeight: "800" }, body: { color: "#64748B", fontSize: 12, lineHeight: 18, marginTop: 5 }, composer: { backgroundColor: "#FFF", padding: 13, borderRadius: 13, marginTop: 14, borderWidth: 1, borderColor: "#E7EBF3" }, section: { color: "#111827", fontSize: 15, fontWeight: "800" }, postInput: { minHeight: 92, borderWidth: 1, borderColor: "#DCE2EA", borderRadius: 9, padding: 10, marginTop: 10, color: "#111827", fontSize: 13 }, counter: { alignSelf: "flex-end", color: "#64748B", fontSize: 10, marginTop: 4 }, selectedMedia: { marginTop: 10 }, selectedImage: { width: "100%", height: 180, borderRadius: 9, backgroundColor: "#F1F5F9" }, removeMedia: { color: "#B91C1C", fontSize: 11, fontWeight: "700", marginTop: 6 }, composerActions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 6 }, attachButton: { paddingHorizontal: 4, paddingVertical: 8 }, postButton: { flex: 1 }, primaryButton: { backgroundColor: BLUE, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 9, marginTop: 9 }, primaryText: { color: "#FFF", fontSize: 12, fontWeight: "700" }, disabled: { opacity: 0.6 }, error: { color: "#9A3412", backgroundColor: "#FFF7ED", padding: 10, borderRadius: 8, marginTop: 10, fontSize: 12 }, empty: { backgroundColor: "#FFF", borderRadius: 12, padding: 18, marginTop: 12 }, post: { backgroundColor: "#FFF", padding: 13, borderRadius: 13, marginTop: 11, borderWidth: 1, borderColor: "#E7EBF3" }, authorRow: { flexDirection: "row", alignItems: "center", gap: 9 }, avatarImage: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EAF2FF" }, avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EAF2FF", alignItems: "center", justifyContent: "center" }, avatarText: { color: BLUE, fontWeight: "800" }, author: { color: "#111827", fontSize: 12, fontWeight: "700" }, date: { color: "#64748B", fontSize: 9, marginTop: 2 }, postBody: { color: "#263244", fontSize: 13, lineHeight: 20, marginTop: 12 }, postMedia: { width: "100%", height: 280, marginTop: 10, borderRadius: 10, backgroundColor: "#F1F5F9" }, mediaNote: { color: "#64748B", fontSize: 11, padding: 10, backgroundColor: "#F6F7FB", marginTop: 9 }, actions: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#EEF0F5", marginTop: 11, paddingTop: 8 }, action: { flex: 1, paddingVertical: 5 }, actionText: { color: "#52607A", fontSize: 11, fontWeight: "700" }, liked: { color: "#D12F57" }, comment: { borderLeftWidth: 2, borderLeftColor: "#DCE2EA", paddingLeft: 9, marginTop: 8 }, commentAuthor: { color: "#344054", fontSize: 10, fontWeight: "700" }, commentBody: { color: "#52607A", fontSize: 11, marginTop: 2 }, commentComposer: { flexDirection: "row", gap: 6, marginTop: 9 }, commentInput: { flex: 1, minHeight: 38, borderWidth: 1, borderColor: "#DCE2EA", borderRadius: 8, paddingHorizontal: 9, color: "#111827", fontSize: 11 }, commentButton: { backgroundColor: BLUE, paddingHorizontal: 12, justifyContent: "center", borderRadius: 8 }, refresh: { padding: 14, alignItems: "center" }, link: { color: BLUE, fontSize: 12, fontWeight: "700" }, secondaryButton: { backgroundColor: "#EFF4FA", padding: 12, borderRadius: 9, alignSelf: "flex-start", marginTop: 10 }, modalScrim: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }, profileModal: { backgroundColor: "#FFF", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 22, minHeight: 210 }, close: { alignSelf: "flex-end", padding: 5 }, closeText: { color: "#64748B", fontSize: 25 }, avatarLarge: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#EAF2FF", alignItems: "center", justifyContent: "center" }, avatarLargeText: { color: BLUE, fontSize: 21, fontWeight: "800" } });
