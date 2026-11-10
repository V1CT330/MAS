import React, { useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const SOCIAL_URL = "https://malawian-app-store-j6pm.vercel.app/console/social";
export default function SocialScreen() {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!isSupabaseConfigured) { if (mounted) { setLoading(false); setNotice("MAS account services are not configured in this build."); } return; }
      const { data } = await supabase.auth.getUser();
      if (mounted) { setAuthenticated(Boolean(data.user)); setLoading(false); }
    };
    void load();
    const { data: listener } = supabase.auth.onAuthStateChange(() => { void load(); });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);
  if (loading) return <View style={styles.center}><ActivityIndicator color="#1877F2" /></View>;
  return <View style={styles.root}><Text style={styles.kicker}>MAS COMMUNITY</Text><Text style={styles.heading}>Social</Text><Text style={styles.body}>Social is a separate MAS space. The native feed, profile, messaging and moderation workflows are not complete yet, so open the existing authenticated MAS Social service rather than using a fake or disconnected feed.</Text>{notice ? <Text style={styles.notice}>{notice}</Text> : null}<TouchableOpacity disabled={!authenticated} onPress={() => void Linking.openURL(SOCIAL_URL)} style={[styles.button, !authenticated && styles.disabled]}><Text style={styles.buttonText}>{authenticated ? "Open MAS Social" : "Sign in to MAS to continue"}</Text></TouchableOpacity>{!authenticated ? <TouchableOpacity onPress={() => void Linking.openURL("https://malawian-app-store-j6pm.vercel.app/auth")}><Text style={styles.link}>Sign in on MAS</Text></TouchableOpacity> : null}</View>;
}
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#F6F7FB", padding: 18, justifyContent: "center" }, center: { flex: 1, alignItems: "center", justifyContent: "center" }, kicker: { color: "#1877F2", fontSize: 10, fontWeight: "800", letterSpacing: 1.1 }, heading: { color: "#111827", fontSize: 25, fontWeight: "800", marginTop: 5 }, body: { color: "#52607A", fontSize: 14, lineHeight: 21, marginTop: 10 }, notice: { color: "#9A3412", fontSize: 12, marginTop: 10 }, button: { minHeight: 46, backgroundColor: "#1877F2", alignItems: "center", justifyContent: "center", borderRadius: 10, marginTop: 18 }, buttonText: { color: "#FFF", fontSize: 13, fontWeight: "700" }, disabled: { opacity: 0.55 }, link: { color: "#1877F2", fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: 14 } });
