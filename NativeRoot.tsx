import React, { useEffect, useState } from "react";
import { Linking, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import StoreScreen from "./src/screens/StoreScreen";
import LibraryScreen from "./src/screens/LibraryScreen";
import NotificationsScreen from "./src/screens/NotificationsScreen";
import AccountScreen from "./src/screens/AccountScreen";
import DeveloperScreen from "./src/screens/DeveloperScreen";
import SocialScreen from "./src/screens/SocialScreen";
import { supabase } from "./src/lib/supabase";

type Space = "store" | "developer" | "social";
type StoreTab = "apps" | "library" | "alerts" | "account";

export default function NativeRoot() {
  const [space, setSpace] = useState<Space>("store");
  const [storeTab, setStoreTab] = useState<StoreTab>("apps");
  const [authUserId, setAuthUserId] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const refreshUser = async () => {
      const { data } = await supabase.auth.getUser();
      if (mounted) setAuthUserId(data.user?.id ?? null);
    };
    void refreshUser();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => setAuthUserId(session?.user.id ?? null));
    const handleUrl = async (url: string) => {
      try {
        const callback = new URL(url);
        if (callback.protocol !== "mw.wealthgrid.mas:") return;
        const errorMessage = callback.searchParams.get("error_description") || callback.searchParams.get("error");
        if (errorMessage) throw new Error(errorMessage);
        const code = callback.searchParams.get("code");
        if (!code) throw new Error("Sign-in did not return an authorization code.");
        await supabase.auth.exchangeCodeForSession(code);
      } catch (error) { console.warn("MAS sign-in callback failed", error); }
    };
    const urlSubscription = Linking.addEventListener("url", ({ url }) => { void handleUrl(url); });
    void Linking.getInitialURL().then((url) => { if (url) return handleUrl(url); }).catch(() => undefined);
    return () => { mounted = false; authListener.subscription.unsubscribe(); urlSubscription.remove(); };
  }, []);

  const openAccount = () => { setSpace("store"); setStoreTab("account"); };
  const current = space === "developer" ? <DeveloperScreen /> : space === "social" ? <SocialScreen /> : storeTab === "apps" ? <StoreScreen /> : storeTab === "library" ? <LibraryScreen /> : storeTab === "alerts" ? <NotificationsScreen /> : <AccountScreen />;
  const title = space === "developer" ? "Developer Mode" : space === "social" ? "Social" : ({ apps: "Discover", library: "My library", alerts: "Alerts", account: "Account" } satisfies Record<StoreTab, string>)[storeTab];

  return <SafeAreaView style={styles.safeArea}>
    <StatusBar barStyle="dark-content" backgroundColor="#F6F7FB" />
    <View style={styles.header}><View><Text style={styles.brand}>Malawian App Store</Text><Text style={styles.title}>{title}</Text></View><TouchableOpacity accessibilityRole="button" accessibilityLabel="Open account" onPress={openAccount} style={styles.accountButton}><Text style={styles.accountGlyph}>{authUserId ? "●" : "○"}</Text></TouchableOpacity></View>
    <View style={styles.spaceTabs}>{(["store", "developer", "social"] as Space[]).map((item) => <TouchableOpacity key={item} accessibilityRole="tab" accessibilityState={{ selected: space === item }} onPress={() => setSpace(item)} style={[styles.spaceTab, space === item && styles.spaceTabActive]}><Text style={[styles.spaceText, space === item && styles.spaceTextActive]}>{item === "store" ? "App Store" : item === "developer" ? "Developer" : "Social"}</Text></TouchableOpacity>)}</View>
    <View style={styles.body}>{current}</View>
    {space === "store" ? <View style={styles.bottomTabs}>{(["apps", "library", "alerts", "account"] as StoreTab[]).map((item) => <TouchableOpacity key={item} accessibilityRole="tab" accessibilityState={{ selected: storeTab === item }} onPress={() => setStoreTab(item)} style={styles.bottomTab}><Text style={[styles.bottomGlyph, storeTab === item && styles.bottomGlyphActive]}>{item === "apps" ? "⌕" : item === "library" ? "▣" : item === "alerts" ? "♧" : "●"}</Text><Text style={[styles.bottomText, storeTab === item && styles.bottomTextActive]}>{item === "apps" ? "Apps" : item === "library" ? "Library" : item === "alerts" ? "Alerts" : "Account"}</Text></TouchableOpacity>)}</View> : null}
  </SafeAreaView>;
}

const styles = StyleSheet.create({ safeArea: { flex: 1, backgroundColor: "#F6F7FB" }, header: { minHeight: 54, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: "#FFF" }, brand: { color: "#64748B", fontSize: 10, fontWeight: "700", letterSpacing: 0.7, textTransform: "uppercase" }, title: { color: "#111827", fontSize: 17, fontWeight: "800", marginTop: 2 }, accountButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#EFF4FA", alignItems: "center", justifyContent: "center" }, accountGlyph: { color: "#1877F2", fontSize: 14 }, spaceTabs: { flexDirection: "row", backgroundColor: "#FFF", paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: "#E7EBF3" }, spaceTab: { flex: 1, alignItems: "center", paddingVertical: 11, borderBottomWidth: 2, borderBottomColor: "transparent" }, spaceTabActive: { borderBottomColor: "#1877F2" }, spaceText: { color: "#64748B", fontSize: 11, fontWeight: "700" }, spaceTextActive: { color: "#1877F2" }, body: { flex: 1 }, bottomTabs: { flexDirection: "row", backgroundColor: "#FFF", borderTopWidth: 1, borderTopColor: "#E7EBF3", paddingBottom: 3 }, bottomTab: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 6 }, bottomGlyph: { fontSize: 18, color: "#64748B" }, bottomGlyphActive: { color: "#1877F2" }, bottomText: { color: "#64748B", fontSize: 9, marginTop: 2 }, bottomTextActive: { color: "#1877F2", fontWeight: "700" } });
