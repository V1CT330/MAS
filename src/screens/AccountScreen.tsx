import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const BLUE = "#1877F2";
const WEB_ORIGIN = "https://malawian-app-store-j6pm.vercel.app";
type Profile = { id: string; display_name: string | null; developer_name: string | null; bio: string | null; mode: string | null; is_developer: boolean | null };

export default function AccountScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = async () => {
    setLoading(true); setNotice("");
    if (!isSupabaseConfigured) { setUserId(null); setEmail(null); setLoading(false); setNotice("MAS account services are not configured in this build."); return; }
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) { setUserId(null); setEmail(null); setProfile(null); setIsAdmin(false); setLoading(false); return; }
    const id = auth.user.id;
    setUserId(id); setEmail(auth.user.email ?? null);
    const [profileResult, roleResult] = await Promise.all([
      supabase.from("profiles").select("id,display_name,developer_name,bio,mode,is_developer").eq("id", id).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", id).eq("role", "admin").maybeSingle(),
    ]);
    if (profileResult.error) setNotice(profileResult.error.message);
    const result = profileResult.data as Profile | null;
    setProfile(result); setDisplayName(result?.display_name ?? ""); setBio(result?.bio ?? "");
    setIsAdmin(Boolean(roleResult.data));
    setLoading(false);
  };

  useEffect(() => {
    void load();
    const { data: listener } = supabase.auth.onAuthStateChange(() => { void load(); });
    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    if (!isSupabaseConfigured) { setNotice("MAS sign-in is unavailable in this unconfigured build."); return; }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "mw.wealthgrid.mas://auth/callback", skipBrowserRedirect: true } });
      if (error) throw error;
      if (!data.url) throw new Error("MAS did not return a sign-in URL.");
      await Linking.openURL(data.url);
      setNotice("Complete Google sign-in in your browser. Return to MAS when prompted.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Could not start sign-in."); }
    finally { setBusy(false); }
  };

  const saveProfile = async () => {
    if (!userId) return;
    if (displayName.trim().length > 80 || bio.trim().length > 300) { setNotice("Display name must be 80 characters or fewer and bio 300 characters or fewer."); return; }
    setBusy(true); setNotice("");
    const { error } = await supabase.from("profiles").update({ display_name: displayName.trim() || null, bio: bio.trim() || null }).eq("id", userId);
    if (error) setNotice(error.message); else { setNotice("Profile saved."); await load(); }
    setBusy(false);
  };

  const signOut = async () => {
    setBusy(true); setNotice("");
    const { error } = await supabase.auth.signOut();
    if (error) setNotice(error.message); else { setProfile(null); setUserId(null); setEmail(null); setNotice("You are signed out."); }
    setBusy(false);
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={BLUE} /></View>;

  return <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.heading}>Your account</Text>
    <Text style={styles.subtitle}>Manage your MAS profile and account access.</Text>
    {!userId ? <View style={styles.card}><Text style={styles.title}>Sign in to MAS</Text><Text style={styles.subtitle}>Your account connects your store library, developer workspace, and Social.</Text><Button label={busy ? "Starting sign-in…" : "Continue with Google"} disabled={busy} onPress={() => void signIn()} /><TouchableOpacity onPress={() => void Linking.openURL(`${WEB_ORIGIN}/auth`)}><Text style={styles.link}>More sign-in options on MAS</Text></TouchableOpacity></View> : <>
      <View style={styles.card}><Text style={styles.title}>{profile?.display_name || profile?.developer_name || "MAS account"}</Text><Text style={styles.subtitle}>{email ?? "Signed-in account"}</Text><Text style={styles.label}>Display name</Text><TextInput value={displayName} onChangeText={setDisplayName} maxLength={80} placeholder="Your name" style={styles.input} /><Text style={styles.label}>Bio</Text><TextInput value={bio} onChangeText={setBio} maxLength={300} multiline textAlignVertical="top" placeholder="A little about yourself" style={[styles.input, styles.bio]} /><Button label={busy ? "Saving…" : "Save profile"} disabled={busy} onPress={() => void saveProfile()} /></View>
      <View style={styles.card}><Text style={styles.title}>MAS spaces</Text><Text style={styles.subtitle}>Developer Mode activation and terms are managed through the existing MAS account workflow.</Text><TouchableOpacity onPress={() => void Linking.openURL(`${WEB_ORIGIN}/settings`)} style={styles.action}><Text style={styles.link}>Manage workspaces and settings on MAS ›</Text></TouchableOpacity><TouchableOpacity onPress={() => void Linking.openURL(`${WEB_ORIGIN}/console/social`)} style={styles.action}><Text style={styles.link}>Open Social ›</Text></TouchableOpacity>{isAdmin ? <TouchableOpacity onPress={() => void Linking.openURL(`${WEB_ORIGIN}/admin`)} style={styles.action}><Text style={styles.link}>Administration dashboard ›</Text></TouchableOpacity> : null}</View>
      <TouchableOpacity disabled={busy} onPress={() => void signOut()} style={styles.signOut}><Text style={styles.signOutText}>{busy ? "Please wait…" : "Sign out"}</Text></TouchableOpacity>
    </>}
    {notice ? <Text accessibilityRole="alert" style={styles.notice}>{notice}</Text> : null}
    <TouchableOpacity onPress={() => void load()} style={styles.refresh}><Text style={styles.link}>Refresh account</Text></TouchableOpacity>
  </ScrollView>;
}
function Button({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) { return <TouchableOpacity disabled={disabled} onPress={onPress} style={[styles.button, disabled && { opacity: 0.6 }]}><Text style={styles.buttonText}>{label}</Text></TouchableOpacity>; }
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#F6F7FB" }, content: { padding: 16, paddingBottom: 30 }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, heading: { color: "#111827", fontSize: 24, fontWeight: "800" }, subtitle: { color: "#64748B", fontSize: 12, lineHeight: 18, marginTop: 5 }, card: { backgroundColor: "#FFF", borderColor: "#E7EBF3", borderWidth: 1, borderRadius: 13, padding: 14, marginTop: 14 }, title: { color: "#111827", fontSize: 15, fontWeight: "700" }, label: { color: "#344054", fontSize: 12, fontWeight: "700", marginTop: 13, marginBottom: 6 }, input: { borderWidth: 1, borderColor: "#DCE2EA", borderRadius: 9, backgroundColor: "#FFF", paddingHorizontal: 11, minHeight: 42, color: "#111827" }, bio: { minHeight: 88, paddingTop: 10 }, button: { minHeight: 43, borderRadius: 9, backgroundColor: BLUE, alignItems: "center", justifyContent: "center", marginTop: 13 }, buttonText: { color: "#FFF", fontSize: 13, fontWeight: "700" }, link: { color: BLUE, fontSize: 12, fontWeight: "700", marginTop: 11 }, action: { paddingVertical: 5 }, signOut: { marginTop: 16, padding: 13, borderRadius: 9, alignItems: "center", borderWidth: 1, borderColor: "#FECACA", backgroundColor: "#FFF" }, signOutText: { color: "#B91C1C", fontSize: 13, fontWeight: "700" }, notice: { marginTop: 12, color: "#374151", backgroundColor: "#EEF2FF", padding: 11, borderRadius: 9, fontSize: 12 }, refresh: { alignItems: "center", padding: 14 } });
