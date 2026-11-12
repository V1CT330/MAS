import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { supabase } from "../lib/supabase";

type Profile = { id: string; display_name: string | null; developer_name: string | null; bio?: string | null; avatar_url?: string | null; cover_image_url?: string | null };
type Post = { id: string; author_id: string; body: string; created_at: string; media_url?: string | null; media_type?: string | null };
type Comment = { id: string; post_id: string; author_id: string; body: string; created_at: string; parent_comment_id?: string | null; media_url?: string | null; media_type?: string | null };
type Connection = { id: string; requester_id: string; recipient_id: string; status: "pending" | "accepted" | "declined"; created_at: string };
type Message = { id: string; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null };
type InvestmentProfile = { user_id:string; role:"founder"|"investor"|"both"; organization_name:string|null; headline:string|null; bio:string|null; location:string|null; visibility:"public"|"connections" };
type Opportunity = { id:string; founder_id:string; title:string; description:string; industry:string; stage:string; funding_goal:number|null; currency:string; use_of_funds:string|null; status:"open"|"paused"|"closed"; created_at:string };
type Sponsored = { id:string; headline:string; body:string|null; image_url:string|null; destination_url:string; starts_at:string|null; ends_at:string|null };
type PickedMedia = { uri: string; mimeType: string; fileName: string; mediaType: "image" | "video" };
const BLUE = "#1877F2";
const socialDb = supabase as any;
const MAX_MEDIA = 50 * 1024 * 1024;
const BUCKET = "social-media";

export default function SocialScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [posts, setPosts] = useState<Post[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [socialAlerts, setSocialAlerts] = useState<{id:string;title:string;body:string;read:boolean;created_at:string}[]>([]);
  const [investorDirectory,setInvestorDirectory] = useState<InvestmentProfile[]>([]);
  const [opportunities,setOpportunities] = useState<Opportunity[]>([]);
  const [sponsored,setSponsored] = useState<Sponsored[]>([]);
  const [draft, setDraft] = useState("");
  const [picked, setPicked] = useState<PickedMedia | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentTarget, setCommentTarget] = useState<{ postId: string; parentId: string | null } | null>(null);
  const [commentAudio, setCommentAudio] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<string | null>(null);
  const [profilePage, setProfilePage] = useState<string | null>(null);
  const [section, setSection] = useState<"Feed" | "People" | "Messages" | "Notifications" | "Search" | "Find Investors" | "Monetization" | "My profile">("Feed");
  const [searchTerm,setSearchTerm] = useState("");
  const [investmentProfile,setInvestmentProfile] = useState<InvestmentProfile|null>(null);
  const [investRole,setInvestRole] = useState<"founder"|"investor"|"both">("both");
  const [investOrg,setInvestOrg] = useState("");
  const [investHeadline,setInvestHeadline] = useState("");
  const [investBio,setInvestBio] = useState("");
  const [investLocation,setInvestLocation] = useState("");
  const [opportunityTitle,setOpportunityTitle] = useState("");
  const [opportunityDescription,setOpportunityDescription] = useState("");
  const [opportunityIndustry,setOpportunityIndustry] = useState("");
  const [opportunityStage,setOpportunityStage] = useState("idea");
  const [opportunityGoal,setOpportunityGoal] = useState("");
  const [opportunityCurrency,setOpportunityCurrency] = useState("MWK");
  const [opportunityFunds,setOpportunityFunds] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) { setUserId(null); setPosts([]); setLoading(false); setError("Sign in to use MAS Social."); return; }
    const me = auth.user.id; setUserId(me);
    const [postRes, connectionRes, messageRes, meRes, peopleRes, alertRes, investRes, directoryRes, opportunitiesRes, adsRes] = await Promise.all([
      supabase.from("social_posts").select("id,author_id,body,created_at,media_url,media_type").order("created_at", { ascending: false }).limit(50),
      supabase.from("social_connections").select("id,requester_id,recipient_id,status,created_at").or("requester_id.eq."+me+",recipient_id.eq."+me).order("created_at", { ascending: false }),
      supabase.from("social_messages").select("id,sender_id,recipient_id,body,created_at,read_at").or("sender_id.eq."+me+",recipient_id.eq."+me).order("created_at", { ascending: true }).limit(300),
      supabase.from("public_profiles").select("id,display_name,developer_name,bio,avatar_url,cover_image_url").eq("id", me).maybeSingle(),
      supabase.from("public_profiles").select("id,display_name,developer_name,bio,avatar_url,cover_image_url").order("display_name",{ascending:true}).limit(100),
      supabase.from("social_notifications").select("id,title,body,read,created_at").eq("user_id",me).order("created_at",{ascending:false}).limit(50),
      socialDb.from("social_investment_profiles").select("*").eq("user_id",me).maybeSingle(),
      socialDb.from("social_investment_profiles").select("*").order("updated_at",{ascending:false}).limit(100),
      socialDb.from("social_investment_opportunities").select("*").order("created_at",{ascending:false}).limit(100),
      socialDb.from("ad_campaigns").select("id,headline,body,image_url,destination_url,placements,starts_at,ends_at,status").eq("status","approved").contains("placements",["social_feed"]).order("created_at",{ascending:false}).limit(10),
    ]);
    if (postRes.error) setError(postRes.error.message);
    if (connectionRes.error) setError(connectionRes.error.message);
    if (messageRes.error) setError(messageRes.error.message);
    if (alertRes.error) setError(alertRes.error.message);
    setSocialAlerts((alertRes.data ?? []) as {id:string;title:string;body:string;read:boolean;created_at:string}[]);
    if (investRes.data) { const saved=investRes.data as InvestmentProfile; setInvestmentProfile(saved); setInvestRole(saved.role); setInvestOrg(saved.organization_name||""); setInvestHeadline(saved.headline||""); setInvestBio(saved.bio||""); setInvestLocation(saved.location||""); }
    if (directoryRes.error) setError(directoryRes.error.message); else setInvestorDirectory((directoryRes.data??[]) as InvestmentProfile[]);
    if (opportunitiesRes.error) setError(opportunitiesRes.error.message); else setOpportunities((opportunitiesRes.data??[]) as Opportunity[]);
    if (adsRes.error) setError(adsRes.error.message); else { const now=Date.now(); setSponsored(((adsRes.data??[]) as Sponsored[]).filter(ad=>(!ad.starts_at||new Date(ad.starts_at).getTime()<=now)&&(!ad.ends_at||new Date(ad.ends_at).getTime()>now))); }
    const postRows = (postRes.data ?? []) as Post[];
    setPosts(postRows); setConnections((connectionRes.data ?? []) as Connection[]); setMessages((messageRes.data ?? []) as Message[]);
    const ids = [...new Set([me, ...postRows.map(p => p.author_id), ...(connectionRes.data ?? []).flatMap((x: Connection) => [x.requester_id,x.recipient_id]), ...(messageRes.data ?? []).flatMap((x: Message) => [x.sender_id,x.recipient_id])])];
    const [profileRes, commentRes] = await Promise.all([
      supabase.from("public_profiles").select("id,display_name,developer_name,bio,avatar_url,cover_image_url").in("id", ids),
      postRows.length ? supabase.from("social_post_comments").select("id,post_id,author_id,body,created_at,parent_comment_id,media_url,media_type").in("post_id", postRows.map(p => p.id)).order("created_at", { ascending: true }).limit(500) : Promise.resolve({ data: [], error: null }),
    ]);
    const map: Record<string, Profile> = {};
    for (const p of (peopleRes.data ?? []) as Profile[]) map[p.id] = p;
    for (const p of (profileRes.data ?? []) as Profile[]) map[p.id] = p;
    if (meRes.data) map[me] = meRes.data as Profile;
    setProfiles(map);
    if (commentRes.error) setError(commentRes.error.message);
    setComments((commentRes.data ?? []) as Comment[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); const channel = supabase.channel("mas-native-social")
    .on("postgres_changes", { event: "*", schema: "public", table: "social_messages" }, () => { void load(); })
    .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [load]);

  const acceptedIds = useMemo(() => new Set(connections.filter(c => c.status === "accepted").map(c => c.requester_id === userId ? c.recipient_id : c.requester_id)), [connections,userId]);
  const people = useMemo(() => Object.values(profiles).filter(p => p.id !== userId), [profiles,userId]);
  const commentsByPost = useMemo(() => { const out: Record<string, Comment[]> = {}; for (const c of comments) (out[c.post_id] ??= []).push(c); return out; }, [comments]);
  const threadMessages = messages.filter(m => selectedPerson && ((m.sender_id === userId && m.recipient_id === selectedPerson) || (m.sender_id === selectedPerson && m.recipient_id === userId)));
  const name = (id: string) => profiles[id]?.developer_name || profiles[id]?.display_name || "MAS member";

  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { setError("Allow photo and video access to attach media."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images","videos"], quality: 0.85, allowsEditing: false });
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0]; const mime = a.mimeType || (a.type === "video" ? "video/mp4" : "image/jpeg");
    if (!["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","video/quicktime"].includes(mime)) { setError("Unsupported media format."); return; }
    if (a.fileSize && a.fileSize > MAX_MEDIA) { setError("Media must be 50 MB or smaller."); return; }
    setPicked({ uri: a.uri, mimeType: mime, fileName: a.fileName || "upload."+mime.split("/")[1], mediaType: a.type === "video" ? "video" : "image" });
  };

  const uploadFile = async (uri: string, fileName: string, mimeType: string, owner: string) => {
    const response = await fetch(uri); if (!response.ok) throw new Error("Could not read the selected file.");
    const blob = await response.blob(); if (!blob.size || blob.size > MAX_MEDIA) throw new Error("File must be larger than 0 bytes and no larger than 50 MB.");
    const ext = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g,"") || "bin";
    const path = owner+"/"+Date.now()+"-"+Math.random().toString(36).slice(2,8)+"."+ext;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: mimeType, upsert: false, cacheControl: "3600" });
    if (uploadError) throw uploadError;
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };

  const submitPost = async () => {
    if (!userId || !draft.trim()) { setError("Write a message to accompany your post media."); return; }
    if (draft.trim().length > 2000) { setError("Posts are limited to 2,000 characters."); return; }
    setBusy(true); setError("");
    try {
      const mediaUrl = picked ? await uploadFile(picked.uri,picked.fileName,picked.mimeType,userId) : null;
      const { error: insertError } = await supabase.from("social_posts").insert({ author_id:userId, body:draft.trim(), media_url:mediaUrl, media_type:picked?.mediaType ?? null });
      if (insertError) throw insertError;
      setDraft(""); setPicked(null); await load();
    } catch(e) { setError(e instanceof Error ? e.message : "Could not publish post."); }
    finally { setBusy(false); }
  };

  const submitComment = async () => {
    if (!userId || !commentTarget) return;
    const body = commentDraft.trim();
    if (!body && !commentAudio) { setError("Write a reply or attach a voice recording."); return; }
    if (body.length > 1000) { setError("Replies are limited to 1,000 characters."); return; }
    setBusy(true); setError("");
    try {
      const mediaUrl = commentAudio ? await uploadFile(commentAudio.uri,commentAudio.name,commentAudio.mimeType || "audio/mp4",userId) : null;
      const { error: e } = await supabase.from("social_post_comments").insert({ post_id:commentTarget.postId, parent_comment_id:commentTarget.parentId, author_id:userId, body, media_url:mediaUrl, media_type:mediaUrl ? "audio" : null });
      if (e) throw e;
      setCommentDraft(""); setCommentAudio(null); setCommentTarget(null); await load();
    } catch(e) { setError(e instanceof Error ? e.message : "Could not send reply."); }
    finally { setBusy(false); }
  };

  const chooseVoice = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type:["audio/*"], copyToCacheDirectory:true, multiple:false });
      if (result.canceled || !result.assets[0]) return;
      const a = result.assets[0];
      if (!a.size || a.size > MAX_MEDIA) { setError("Voice files must be larger than 0 bytes and no larger than 50 MB."); return; }
      setCommentAudio(a); setError("");
    } catch(e) { setError(e instanceof Error ? e.message : "Could not select an audio file."); }
  };

  const toggleLike = async (postId: string) => {
    if (!userId) return; setBusy(true);
    const { data: existing, error: readError } = await supabase.from("social_post_reactions").select("id").eq("post_id",postId).eq("user_id",userId).maybeSingle();
    if (readError) setError(readError.message);
    else {
      const result = existing ? await supabase.from("social_post_reactions").delete().eq("id",existing.id) : await supabase.from("social_post_reactions").insert({ post_id:postId,user_id:userId });
      if (result.error) setError(result.error.message); else await load();
    }
    setBusy(false);
  };

  const saveInvestmentProfile = async () => { if(!userId)return; setBusy(true); const {error:e}=await socialDb.from("social_investment_profiles").upsert({user_id:userId,role:investRole,organization_name:investOrg.trim()||null,headline:investHeadline.trim()||null,bio:investBio.trim()||null,location:investLocation.trim()||null,visibility:"public"},{onConflict:"user_id"}); if(e)setError(e.message); else await load(); setBusy(false); };
  const publishOpportunity = async () => { if(!userId)return; if(opportunityTitle.trim().length<3||opportunityDescription.trim().length<20||opportunityIndustry.trim().length<2){setError("Add a title, a description of at least 20 characters and an industry.");return;} const goal=opportunityGoal.trim()?Number(opportunityGoal):null; if(goal!==null&&(!Number.isFinite(goal)||goal<=0)){setError("Funding target must be a positive number.");return;} setBusy(true); const {error:e}=await socialDb.from("social_investment_opportunities").insert({founder_id:userId,title:opportunityTitle.trim(),description:opportunityDescription.trim(),industry:opportunityIndustry.trim(),stage:opportunityStage,funding_goal:goal,currency:opportunityCurrency,use_of_funds:opportunityFunds.trim()||null}); if(e)setError(e.message); else {setOpportunityTitle("");setOpportunityDescription("");setOpportunityIndustry("");setOpportunityGoal("");setOpportunityFunds("");await load();} setBusy(false); };
  const updateOpportunity = async (item:Opportunity,status:"open"|"paused"|"closed") => {setBusy(true);const {error:e}=await socialDb.from("social_investment_opportunities").update({status}).eq("id",item.id).eq("founder_id",userId);if(e)setError(e.message);else await load();setBusy(false);};
  const sendConnection = async (personId: string) => {
    if (!userId) return; setBusy(true);
    const { error: e } = await supabase.from("social_connections").insert({ requester_id:userId,recipient_id:personId,status:"pending" });
    if (e) setError(e.message); else await load(); setBusy(false);
  };
  const respondConnection = async (connection: Connection, status: "accepted" | "declined") => {
    setBusy(true); const { error: e } = await supabase.from("social_connections").update({ status }).eq("id",connection.id);
    if (e) setError(e.message); else await load(); setBusy(false);
  };
  const markAlertRead = async (id: string) => { const { error: e } = await supabase.from("social_notifications").update({read:true}).eq("id",id).eq("user_id",userId); if(e) setError(e.message); else setSocialAlerts(rows => rows.map(row => row.id===id?{...row,read:true}:row)); };
  const sendMessage = async () => {
    if (!userId || !selectedPerson || !messageDraft.trim()) return;
    if (messageDraft.trim().length > 4000) { setError("Messages are limited to 4,000 characters."); return; }
    setBusy(true); const { error: e } = await supabase.from("social_messages").insert({ sender_id:userId,recipient_id:selectedPerson,body:messageDraft.trim() });
    if (e) setError(e.message); else { setMessageDraft(""); await load(); } setBusy(false);
  };
  const openConversation = async (id: string) => {
    setSelectedPerson(id); setSection("Messages");
    if (!userId) return;
    const unread = messages.filter(m => m.sender_id === id && m.recipient_id === userId && !m.read_at).map(m => m.id);
    if (unread.length) await supabase.from("social_messages").update({ read_at:new Date().toISOString() }).in("id",unread);
  };
  const renderProfile = (id: string) => {
    const p = profiles[id]; if (!p) return null;
    return <View style={s.profilePage}>
      {p.cover_image_url ? <Image source={{uri:p.cover_image_url}} style={s.cover} /> : <View style={s.coverPlaceholder} />}
      <View style={s.profileRow}>{p.avatar_url ? <Image source={{uri:p.avatar_url}} style={s.avatarLarge} /> : <View style={s.avatarLarge}><Text style={s.avatarText}>{name(id).slice(0,1).toUpperCase()}</Text></View>}
        <View style={{flex:1}}><Text style={s.title}>{name(id)}</Text><Text style={s.muted}>{id === userId ? "Your MAS profile" : acceptedIds.has(id) ? "Friend" : "MAS member"}</Text></View>
      </View>
      <Text style={s.copy}>{p.bio || "No biography added yet."}</Text>
      {id !== userId ? <View style={s.row}>
        {acceptedIds.has(id) ? <Action title="Message" onPress={() => void openConversation(id)} /> : <Action title="Add friend" onPress={() => void sendConnection(id)} />}
      </View> : null}
      <Text style={s.section}>Recent posts</Text>
      {posts.filter(post => post.author_id === id).map(post => <View key={post.id} style={s.card}><Text style={s.copy}>{post.body}</Text>{post.media_url ? <Action title="Open media" onPress={() => void Linking.openURL(post.media_url!)} secondary /> : null}</View>)}
    </View>;
  };

  if (loading) return <View style={s.center}><ActivityIndicator color={BLUE} /></View>;
  if (!userId) return <View style={s.root}><Text style={s.title}>MAS Social</Text><Text style={s.copy}>{error || "Sign in to access Social."}</Text><Action title="Try again" onPress={() => void load()} /></View>;
  return <View style={s.root}>
    <View style={s.top}><Text style={s.title}>Social</Text><TouchableOpacity onPress={() => void load()}><Text style={s.link}>Refresh</Text></TouchableOpacity></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs}>{(["Feed","People","Messages","Notifications","Search","Find Investors","Monetization","My profile"] as const).map(tab => <TouchableOpacity key={tab} onPress={() => {setSection(tab);setProfilePage(null);}} style={[s.tab,section===tab&&s.tabActive]}><Text style={[s.tabText,section===tab&&s.tabTextActive]}>{tab}</Text></TouchableOpacity>)}</ScrollView>
    <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {error ? <Text accessibilityRole="alert" style={s.error}>{error}</Text> : null}
      {profilePage ? <><TouchableOpacity onPress={() => setProfilePage(null)}><Text style={s.link}>‹ Back</Text></TouchableOpacity>{renderProfile(profilePage)}</> : section === "My profile" ? renderProfile(userId) : null}
      {section === "Feed" && !profilePage ? <>
        <View style={s.card}><Text style={s.section}>Create a post</Text><TextInput value={draft} onChangeText={setDraft} multiline maxLength={2000} placeholder="What would you like to share?" style={s.input} />
          {picked ? <Text style={s.muted}>{picked.fileName}</Text> : null}
          <View style={s.row}><Action title="Photo or video" secondary onPress={() => void pickMedia()} /><Action title={busy ? "Posting…" : "Post"} disabled={busy} onPress={() => void submitPost()} /></View>
        </View>
        {sponsored.map(ad=><View key={ad.id} style={s.card}><Text style={s.muted}>SPONSORED</Text><Text style={s.authorName}>{ad.headline}</Text>{ad.body?<Text style={s.copy}>{ad.body}</Text>:null}{ad.image_url?<Image source={{uri:ad.image_url}} style={s.postImage} resizeMode="cover"/>:null}<Action title="Learn more" secondary onPress={()=>{try{const u=new URL(ad.destination_url);if(u.protocol!=="https:")throw new Error();void Linking.openURL(u.toString());}catch{setError("This sponsored link is invalid.");}}}/></View>)}
        {posts.map(post => {
          const list = commentsByPost[post.id] ?? [];
          const liked = false;
          return <View key={post.id} style={s.card}>
            <TouchableOpacity style={s.author} onPress={() => {setProfilePage(post.author_id);setSection("Feed");}}><Text style={s.authorName}>{name(post.author_id)}</Text><Text style={s.muted}>{new Date(post.created_at).toLocaleString()}</Text></TouchableOpacity>
            {post.body ? <Text style={s.copy}>{post.body}</Text> : null}
            {post.media_url && post.media_type === "image" ? <Image source={{uri:post.media_url}} style={s.postImage} resizeMode="cover" /> : null}
            {post.media_url && post.media_type === "video" ? <Action title="Open video" secondary onPress={() => void Linking.openURL(post.media_url!)} /> : null}
            <View style={s.row}><Action title="Like" secondary onPress={() => void toggleLike(post.id)} /><Action title={"Comment · "+list.length} secondary onPress={() => setCommentTarget({postId:post.id,parentId:null})} /></View>
            {list.map(comment => <View key={comment.id} style={[s.comment,comment.parent_comment_id ? s.reply : null]}>
              <Text style={s.commentAuthor}>{name(comment.author_id)}</Text>{comment.body ? <Text style={s.copy}>{comment.body}</Text> : null}
              {comment.media_url ? <Action title="▶ Play voice reply" secondary onPress={() => void Linking.openURL(comment.media_url!)} /> : null}
              <TouchableOpacity onPress={() => setCommentTarget({postId:post.id,parentId:comment.id})}><Text style={s.link}>Reply</Text></TouchableOpacity>
            </View>)}
            {commentTarget?.postId === post.id ? <View style={s.commentBox}>
              <Text style={s.muted}>{commentTarget.parentId ? "Replying to comment" : "Comment on post"}</Text>
              <TextInput value={commentDraft} onChangeText={setCommentDraft} maxLength={1000} placeholder="Write a reply…" style={s.input} />
              {commentAudio ? <Text style={s.muted}>Voice: {commentAudio.name}</Text> : null}
              <View style={s.row}><Action title="Attach voice recording" secondary onPress={() => void chooseVoice()} /><Action title="Send" disabled={busy} onPress={() => void submitComment()} /></View>
              <TouchableOpacity onPress={() => {setCommentTarget(null);setCommentDraft("");setCommentAudio(null);}}><Text style={s.muted}>Cancel</Text></TouchableOpacity>
            </View> : null}
          </View>;
        })}
        {!posts.length ? <Text style={s.copy}>No posts yet. Start the conversation.</Text> : null}
      </> : null}
      {section === "People" && !profilePage ? <>
        <Text style={s.section}>People on MAS</Text>
        {people.map(person => {
          const relation = connections.find(c => (c.requester_id===person.id&&c.recipient_id===userId)||(c.recipient_id===person.id&&c.requester_id===userId));
          return <View key={person.id} style={s.person}>
            <TouchableOpacity style={{flex:1}} onPress={() => setProfilePage(person.id)}><Text style={s.authorName}>{name(person.id)}</Text><Text style={s.muted}>{person.bio || "MAS member"}</Text></TouchableOpacity>
            {acceptedIds.has(person.id) ? <Action title="Message" secondary onPress={() => void openConversation(person.id)} /> :
              relation?.status === "pending" && relation.recipient_id === userId ? <View style={s.row}><Action title="Accept" onPress={() => void respondConnection(relation,"accepted")} /><Action title="Decline" secondary onPress={() => void respondConnection(relation,"declined")} /></View> :
              relation?.status === "pending" ? <Text style={s.muted}>Requested</Text> : <Action title="Add friend" onPress={() => void sendConnection(person.id)} />}
          </View>;
        })}
      </> : null}
      {section === "Search" && !profilePage ? <>
        <Text style={s.section}>Search MAS Social</Text>
        <TextInput value={searchTerm} onChangeText={setSearchTerm} placeholder="Search people and posts…" style={s.input} />
        {searchTerm.trim().length>0 ? <>
          {people.filter(p => name(p.id).toLowerCase().includes(searchTerm.trim().toLowerCase()) || (p.bio||"").toLowerCase().includes(searchTerm.trim().toLowerCase())).map(p => <TouchableOpacity key={p.id} onPress={() => setProfilePage(p.id)} style={s.person}><Text style={s.authorName}>{name(p.id)}</Text><Text style={s.muted}>{p.bio||"MAS member"}</Text></TouchableOpacity>)}
          {posts.filter(p => p.body.toLowerCase().includes(searchTerm.trim().toLowerCase())).map(p => <View key={p.id} style={s.card}><Text style={s.authorName}>{name(p.author_id)}</Text><Text style={s.copy}>{p.body}</Text></View>)}
        </> : <Text style={s.copy}>Search members and public posts.</Text>}
      </> : null}
      {section === "Find Investors" && !profilePage ? <>
        <Text style={s.section}>Find Investors</Text><Text style={s.copy}>Founder and investor introductions. Listings are introductions, not verified investments or financial advice. MAS does not process investments here.</Text>
        <View style={s.card}><Text style={s.section}>Your founder / investor profile</Text>
          <TextInput value={investRole} onChangeText={v=>setInvestRole(v as "founder"|"investor"|"both")} placeholder="Role: founder, investor or both" style={s.input}/>
          <TextInput value={investOrg} onChangeText={setInvestOrg} maxLength={120} placeholder="Organization / startup" style={s.input}/>
          <TextInput value={investHeadline} onChangeText={setInvestHeadline} maxLength={160} placeholder="Headline" style={s.input}/>
          <TextInput value={investBio} onChangeText={setInvestBio} maxLength={1500} multiline placeholder="About you and your investment interests" style={s.input}/>
          <TextInput value={investLocation} onChangeText={setInvestLocation} maxLength={120} placeholder="Location" style={s.input}/>
          <Action title={busy?"Saving…":"Save profile"} disabled={busy} onPress={()=>void saveInvestmentProfile()}/>
        </View>
        <View style={s.card}><Text style={s.section}>Publish a startup opportunity</Text>
          <TextInput value={opportunityTitle} onChangeText={setOpportunityTitle} maxLength={120} placeholder="Opportunity title" style={s.input}/>
          <TextInput value={opportunityIndustry} onChangeText={setOpportunityIndustry} maxLength={80} placeholder="Industry" style={s.input}/>
          <TextInput value={opportunityStage} onChangeText={setOpportunityStage} placeholder="Stage: idea, prototype, early_revenue, growth, established" style={s.input}/>
          <TextInput value={opportunityDescription} onChangeText={setOpportunityDescription} maxLength={4000} multiline placeholder="Describe the problem, solution and support needed (20+ characters)" style={s.input}/>
          <TextInput value={opportunityGoal} onChangeText={setOpportunityGoal} keyboardType="decimal-pad" placeholder="Funding target (optional)" style={s.input}/>
          <TextInput value={opportunityCurrency} onChangeText={setOpportunityCurrency} placeholder="Currency: MWK, USD, ZAR, GBP or EUR" style={s.input}/>
          <TextInput value={opportunityFunds} onChangeText={setOpportunityFunds} maxLength={1000} placeholder="Use of funds (optional)" style={s.input}/>
          <Action title={busy?"Publishing…":"Publish opportunity"} disabled={busy} onPress={()=>void publishOpportunity()}/>
        </View>
        <Text style={s.section}>Open startup opportunities</Text>
        {opportunities.filter(o=>o.status==="open"||o.founder_id===userId).map(item=><View key={item.id} style={s.card}><Text style={s.authorName}>{item.title}</Text><Text style={s.muted}>{name(item.founder_id)} · {item.industry} · {item.stage.replaceAll("_"," ")}</Text><Text style={s.copy}>{item.description}</Text>{item.funding_goal!==null?<Text style={s.copy}>Target: {item.currency} {Number(item.funding_goal).toLocaleString()}</Text>:null}<View style={s.row}>{item.founder_id===userId?<><Action title={item.status==="open"?"Pause":"Reopen"} secondary onPress={()=>void updateOpportunity(item,item.status==="open"?"paused":"open")}/><Action title="Close" secondary onPress={()=>void updateOpportunity(item,"closed")}/></>:acceptedIds.has(item.founder_id)?<Action title="Message founder" onPress={()=>void openConversation(item.founder_id)}/>:<Action title="Connect with founder" onPress={()=>void sendConnection(item.founder_id)}/>}</View></View>)}
        <Text style={s.section}>Investor directory</Text>
        {investorDirectory.filter(p=>p.user_id!==userId&&(p.role==="investor"||p.role==="both")).map(p=><View key={p.user_id} style={s.person}><View style={{flex:1}}><Text style={s.authorName}>{p.organization_name||name(p.user_id)}</Text><Text style={s.muted}>{p.headline||p.role}{p.location?" · "+p.location:""}</Text><Text style={s.copy}>{p.bio}</Text></View>{acceptedIds.has(p.user_id)?<Action title="Message" secondary onPress={()=>void openConversation(p.user_id)}/>:<Action title="Connect" onPress={()=>void sendConnection(p.user_id)}/>}</View>)}
      </> : null}
      {section === "Monetization" && !profilePage ? <>
        <Text style={s.section}>Creator monetization</Text><Text style={s.copy}>Setup pending. Build an audience and share useful work while MAS connects the payment infrastructure.</Text>
        <Text style={s.error}>Social payments are not active. Do not accept money for tips, memberships, paid posts, sponsorships or referrals through MAS until checkout, earnings records, refunds and payouts are enabled.</Text>
        {["Tips and support","Paid memberships","Paid posts and products","Sponsored content","Referral commissions"].map(label=><View key={label} style={s.card}><Text style={s.authorName}>{label}</Text><Text style={s.muted}>Planned · payments and creator eligibility required</Text></View>)}
        <Action title="Open advertising" secondary onPress={()=>void Linking.openURL("https://malawian-app-store.vercel.app/advertise")}/>
      </> : null}
      {section === "Notifications" && !profilePage ? <>
        <Text style={s.section}>Social notifications</Text>
        {socialAlerts.map(alert => <TouchableOpacity key={alert.id} onPress={() => void markAlertRead(alert.id)} style={[s.card,!alert.read&&{borderColor:BLUE}]}>
          <Text style={s.authorName}>{alert.title}</Text><Text style={s.copy}>{alert.body}</Text><Text style={s.muted}>{new Date(alert.created_at).toLocaleString()} · {alert.read ? "Read" : "Unread"}</Text>
        </TouchableOpacity>)}
        {!socialAlerts.length ? <Text style={s.copy}>No Social notifications yet.</Text> : null}
      </> : null}
      {section === "Messages" && !profilePage ? <>
        <Text style={s.section}>Private messages</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{maxHeight:58}}>
          {[...new Set(messages.flatMap(m => [m.sender_id,m.recipient_id]).filter(id => id !== userId))].map(id => <TouchableOpacity key={id} onPress={() => void openConversation(id)} style={[s.personChip,selectedPerson===id&&s.tabActive]}><Text style={[s.tabText,selectedPerson===id&&s.tabTextActive]}>{name(id)}</Text></TouchableOpacity>)}
          {people.filter(p => acceptedIds.has(p.id) && !messages.some(m => m.sender_id===p.id||m.recipient_id===p.id)).map(p => <TouchableOpacity key={p.id} onPress={() => void openConversation(p.id)} style={s.personChip}><Text style={s.tabText}>{name(p.id)}</Text></TouchableOpacity>)}
        </ScrollView>
        {selectedPerson ? <>
          {threadMessages.map(m => <View key={m.id} style={[s.message,m.sender_id===userId?s.myMessage:s.theirMessage]}><Text style={m.sender_id===userId?s.myMessageText:s.copy}>{m.body}</Text><Text style={[s.muted,m.sender_id===userId&&{color:"#EAF2FF"}]}>{new Date(m.created_at).toLocaleString()}</Text></View>)}
          <TextInput value={messageDraft} onChangeText={setMessageDraft} maxLength={4000} placeholder="Write a message…" style={s.input} />
          <Action title={busy ? "Sending…" : "Send message"} disabled={busy} onPress={() => void sendMessage()} />
        </> : <Text style={s.copy}>Choose a friend to open a conversation. Add friends from the People tab.</Text>}
      </> : null}
    </ScrollView>
  </View>;
}

function Action({title,onPress,disabled,secondary}:{title:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button,secondary&&s.secondary,disabled&&{opacity:0.5}]}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></TouchableOpacity>;
}
const s=StyleSheet.create({
 root:{flex:1,backgroundColor:"#F6F7FB"},center:{flex:1,alignItems:"center",justifyContent:"center"},top:{paddingHorizontal:16,paddingTop:12,paddingBottom:4,flexDirection:"row",justifyContent:"space-between",alignItems:"center"},title:{fontSize:22,fontWeight:"800",color:"#111827"},link:{color:BLUE,fontWeight:"700",fontSize:12},tabs:{maxHeight:50,paddingHorizontal:12},tab:{paddingHorizontal:15,paddingVertical:10,borderRadius:20,marginRight:6,backgroundColor:"#FFF"},tabActive:{backgroundColor:BLUE},tabText:{fontSize:12,color:"#52607A",fontWeight:"700"},tabTextActive:{color:"#FFF"},content:{padding:14,paddingBottom:36},card:{backgroundColor:"#FFF",borderRadius:13,padding:13,marginBottom:12,borderWidth:1,borderColor:"#E7EBF3"},section:{fontSize:15,fontWeight:"800",color:"#111827",marginBottom:8},copy:{fontSize:12,color:"#344054",lineHeight:19,marginTop:6},muted:{fontSize:10,color:"#64748B",marginTop:3},input:{minHeight:44,borderWidth:1,borderColor:"#DCE2EA",borderRadius:9,paddingHorizontal:10,paddingVertical:9,color:"#111827",marginTop:8,backgroundColor:"#FFF"},row:{flexDirection:"row",gap:7,alignItems:"center",flexWrap:"wrap",marginTop:8},button:{backgroundColor:BLUE,minHeight:38,paddingHorizontal:12,borderRadius:9,alignItems:"center",justifyContent:"center"},buttonText:{color:"#FFF",fontSize:11,fontWeight:"700"},secondary:{backgroundColor:"#EFF4FA"},secondaryText:{color:BLUE},author:{marginBottom:8},authorName:{fontSize:13,fontWeight:"800",color:"#111827"},postImage:{width:"100%",height:230,borderRadius:9,marginTop:9},comment:{marginTop:9,padding:10,borderRadius:10,backgroundColor:"#F3F6FA"},reply:{marginLeft:16,backgroundColor:"#F7F8FA"},commentAuthor:{fontSize:11,fontWeight:"800",color:"#344054"},commentBox:{marginTop:10,padding:10,borderRadius:10,backgroundColor:"#F7F9FC"},error:{color:"#9A3412",backgroundColor:"#FFF7ED",padding:10,borderRadius:8,marginBottom:10,fontSize:12},person:{flexDirection:"row",alignItems:"center",gap:8,paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#E7EBF3"},personChip:{padding:10,backgroundColor:"#FFF",borderRadius:20,marginRight:7},message:{maxWidth:"88%",padding:11,borderRadius:15,marginVertical:5},myMessage:{alignSelf:"flex-end",backgroundColor:BLUE},theirMessage:{alignSelf:"flex-start",backgroundColor:"#E4E6EB"},myMessageText:{color:"#FFF",fontSize:12},profilePage:{backgroundColor:"#FFF",borderRadius:13,overflow:"hidden",paddingBottom:14,marginTop:10},cover:{width:"100%",height:125},coverPlaceholder:{height:90,backgroundColor:"#EAF2FF"},profileRow:{flexDirection:"row",alignItems:"center",gap:10,padding:12},avatarLarge:{width:58,height:58,borderRadius:29,backgroundColor:"#EAF2FF",alignItems:"center",justifyContent:"center"},avatarText:{fontSize:18,color:BLUE,fontWeight:"800"}
});
