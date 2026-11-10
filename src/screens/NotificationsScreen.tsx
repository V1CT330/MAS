import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

type Notification = { id: string; title: string; body: string | null; read: boolean; created_at: string };
export default function NotificationsScreen() {
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    if (!isSupabaseConfigured) { setLoading(false); setError("MAS account services are not configured in this build."); return; }
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setUserId(null); setItems([]); setLoading(false); return; }
    setUserId(auth.user.id);
    const { data, error: requestError } = await supabase.from("notifications").select("id,title,body,read,created_at").eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(50);
    if (requestError) setError(requestError.message); else setItems((data ?? []) as Notification[]);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const markAllRead = async () => {
    if (!userId) return;
    setBusy(true); setError("");
    const { error: requestError } = await supabase.from("notifications").update({ read: true }).eq("user_id", userId).eq("read", false);
    if (requestError) setError(requestError.message); else await load();
    setBusy(false);
  };
  const dismiss = async (id: string) => {
    if (!userId) return;
    setBusy(true); setError("");
    const { error: requestError } = await supabase.from("notifications").delete().eq("id", id).eq("user_id", userId);
    if (requestError) setError(requestError.message); else setItems((current) => current.filter((item) => item.id !== id));
    setBusy(false);
  };
  return <ScrollView style={styles.root} contentContainerStyle={styles.content}>
    <View style={styles.headingRow}><View><Text style={styles.heading}>Notifications</Text><Text style={styles.subtitle}>Store updates, review decisions and messages from MAS.</Text></View><TouchableOpacity disabled={busy || !items.some((item) => !item.read)} onPress={() => void markAllRead()} style={[styles.markButton, (busy || !items.some((item) => !item.read)) && styles.disabled]}><Text style={styles.markText}>Mark all read</Text></TouchableOpacity></View>
    {loading ? <ActivityIndicator style={{ marginTop: 24 }} color="#1877F2" /> : null}
    {error ? <View><Text accessibilityRole="alert" style={styles.error}>{error}</Text><TouchableOpacity onPress={() => void load()}><Text style={styles.markText}>Try again</Text></TouchableOpacity></View> : null}
    {!loading && !userId ? <Empty text="Sign in to view notifications for your account." /> : null}
    {!loading && userId && !items.length ? <Empty text="Nothing here yet." /> : null}
    {!loading && items.map((item) => <View key={item.id} style={[styles.card, !item.read && styles.unread]}><View style={styles.cardBody}><Text style={styles.title}>{item.title}</Text>{item.body ? <Text style={styles.body}>{item.body}</Text> : null}<Text style={styles.date}>{new Date(item.created_at).toLocaleString()}{!item.read ? " · new" : ""}</Text></View><TouchableOpacity disabled={busy} onPress={() => void dismiss(item.id)} style={styles.dismiss}><Text style={styles.dismissText}>Dismiss</Text></TouchableOpacity></View>)}
    <TouchableOpacity onPress={() => void load()} style={styles.refresh}><Text style={styles.markText}>Refresh</Text></TouchableOpacity>
  </ScrollView>;
}
function Empty({ text }: { text: string }) { return <View style={styles.empty}><Text style={styles.body}>{text}</Text></View>; }
const styles = StyleSheet.create({ root: { flex: 1, backgroundColor: "#F6F7FB" }, content: { padding: 16, paddingBottom: 32 }, headingRow: { flexDirection: "row", alignItems: "center", gap: 8, justifyContent: "space-between" }, heading: { color: "#111827", fontSize: 23, fontWeight: "800" }, subtitle: { color: "#64748B", fontSize: 11, marginTop: 4, flexShrink: 1 }, markButton: { backgroundColor: "#EFF4FA", paddingHorizontal: 9, paddingVertical: 9, borderRadius: 8 }, markText: { color: "#1877F2", fontSize: 11, fontWeight: "700" }, card: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E7EBF3", borderRadius: 12, padding: 13, marginTop: 10 }, unread: { borderLeftWidth: 3, borderLeftColor: "#1877F2" }, cardBody: { flex: 1 }, title: { color: "#111827", fontSize: 13, fontWeight: "700" }, body: { color: "#52607A", fontSize: 12, lineHeight: 18, marginTop: 5 }, date: { color: "#64748B", fontSize: 10, marginTop: 6 }, dismiss: { padding: 5 }, dismissText: { color: "#1877F2", fontSize: 10, fontWeight: "700" }, empty: { backgroundColor: "#FFF", borderRadius: 12, padding: 24, alignItems: "center", marginTop: 14 }, error: { color: "#9A3412", backgroundColor: "#FFF7ED", padding: 10, borderRadius: 8, marginTop: 12, fontSize: 12 }, disabled: { opacity: 0.5 }, refresh: { padding: 14, alignItems: "center" } });
