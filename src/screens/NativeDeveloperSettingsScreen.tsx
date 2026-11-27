import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";

const WEB = "https://malawian-app-store.vercel.app";
type Props = { onBack: () => void };
type SocialLinks = {
  facebook_url: string;
  x_url: string;
  linkedin_url: string;
  instagram_url: string;
  youtube_url: string;
  whatsapp_url: string;
};
type Profile = {
  display_name: string | null;
  developer_name: string | null;
  company_name: string | null;
  bio: string | null;
  skills: string[] | null;
  location: string | null;
  contact_email: string | null;
  website_url: string | null;
  github_url: string | null;
  portfolio_url: string | null;
} & { [K in keyof SocialLinks]: string | null };

const EMPTY_SOCIALS: SocialLinks = {
  facebook_url: "",
  x_url: "",
  linkedin_url: "",
  instagram_url: "",
  youtube_url: "",
  whatsapp_url: "",
};

const SOCIAL_FIELDS: Array<{ key: keyof SocialLinks; label: string; placeholder: string }> = [
  { key: "facebook_url", label: "Facebook", placeholder: "https://facebook.com/…" },
  { key: "x_url", label: "X (Twitter)", placeholder: "https://x.com/…" },
  { key: "linkedin_url", label: "LinkedIn", placeholder: "https://linkedin.com/in/…" },
  { key: "instagram_url", label: "Instagram", placeholder: "https://instagram.com/…" },
  { key: "youtube_url", label: "YouTube", placeholder: "https://youtube.com/@…" },
  { key: "whatsapp_url", label: "WhatsApp", placeholder: "https://wa.me/265…" },
];

type KeyboardKind = "default" | "email-address" | "url";

export default function NativeDeveloperSettingsScreen({ onBack }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [developerName, setDeveloperName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [location, setLocation] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [socials, setSocials] = useState<SocialLinks>(EMPTY_SOCIALS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setMessage("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) {
        setUserId(null);
        setMessage(authError?.message || "Sign in to manage developer settings.");
        return;
      }
      setUserId(auth.user.id);
      const { data, error } = await supabase.from("profiles")
        .select("display_name,developer_name,company_name,bio,skills,location,contact_email,website_url,github_url,portfolio_url,facebook_url,x_url,linkedin_url,instagram_url,youtube_url,whatsapp_url")
        .eq("id", auth.user.id).maybeSingle();
      if (error) throw error;
      const row = data as Profile | null;
      setDisplayName(row?.display_name ?? "");
      setDeveloperName(row?.developer_name ?? "");
      setCompanyName(row?.company_name ?? "");
      setBio(row?.bio ?? "");
      setSkills(Array.isArray(row?.skills) ? row.skills.join(", ") : "");
      setLocation(row?.location ?? "");
      setContactEmail(row?.contact_email ?? "");
      setWebsiteUrl(row?.website_url ?? "");
      setGithubUrl(row?.github_url ?? "");
      setPortfolioUrl(row?.portfolio_url ?? "");
      setSocials({
        facebook_url: row?.facebook_url ?? "",
        x_url: row?.x_url ?? "",
        linkedin_url: row?.linkedin_url ?? "",
        instagram_url: row?.instagram_url ?? "",
        youtube_url: row?.youtube_url ?? "",
        whatsapp_url: row?.whatsapp_url ?? "",
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not load developer settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveProfile = async () => {
    if (!userId) return;
    const cleanDisplay = displayName.trim();
    const cleanDeveloper = developerName.trim();
    const cleanBio = bio.trim();
    if (cleanDisplay.length > 80 || cleanDeveloper.length > 80 || cleanBio.length > 600) {
      setMessage("Names must be 80 characters or fewer. Professional bio must be 600 characters or fewer.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.from("profiles").update({
        display_name: cleanDisplay || null,
        developer_name: cleanDeveloper || null,
        company_name: companyName.trim() || null,
        bio: cleanBio || null,
        skills: skills.split(",").map((item) => item.trim()).filter(Boolean),
        location: location.trim() || null,
        contact_email: contactEmail.trim() || null,
        website_url: websiteUrl.trim() || null,
        github_url: githubUrl.trim() || null,
        portfolio_url: portfolioUrl.trim() || null,
      }).eq("id", userId);
      if (error) throw error;
      setMessage("Developer profile saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save developer profile.");
    } finally {
      setBusy(false);
    }
  };

  const saveSocials = async () => {
    if (!userId) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.from("profiles").update(socials).eq("id", userId);
      if (error) throw error;
      setMessage("Social pages saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save social pages.");
    } finally {
      setBusy(false);
    }
  };

  const open = async (path: string) => {
    try { await Linking.openURL(WEB + path); }
    catch { setMessage("Could not open the secure MAS account page."); }
  };

  const field = (label: string, value: string, onChangeText: (next: string) => void, placeholder: string, keyboardKind: KeyboardKind = "default", maxLength?: number) => (
    <View style={s.field} key={label}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardKind}
        autoCapitalize={keyboardKind === "default" ? "sentences" : "none"}
        maxLength={maxLength}
        style={s.input}
      />
    </View>
  );

  if (loading) return <View style={s.center}><ActivityIndicator color="#1A73E8" /></View>;
  return <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backText}>‹  Developer dashboard</Text></TouchableOpacity>
    <Text style={s.eyebrow}>DEVELOPER ACCOUNT</Text>
    <Text style={s.title}>Account settings</Text>
    <Text style={s.copy}>Manage the public identity and contact links attached to your developer account. Security-sensitive actions stay in MAS secure account pages.</Text>
    {userId ? <>
      <View style={s.panel}>
        <Text style={s.heading}>Professional details</Text>
        {field("Display name", displayName, setDisplayName, "Your display name", "default", 80)}
        {field("Developer or studio name", developerName, setDeveloperName, "Developer name", "default", 80)}
        {field("Registered company", companyName, setCompanyName, "Optional company name")}
        <View style={s.field}>
          <Text style={s.label}>Professional bio</Text>
          <TextInput value={bio} onChangeText={setBio} maxLength={600} multiline textAlignVertical="top" placeholder="What you build, who you build it for, and the problems you solve." style={[s.input, s.bio]} />
        </View>
        {field("Skills", skills, setSkills, "Flutter, Supabase, payments, USSD")}
        <Text style={s.helper}>Separate each skill with a comma.</Text>
        {field("Location", location, setLocation, "Lilongwe, Malawi")}
        {field("Contact email", contactEmail, setContactEmail, "you@example.com", "email-address")}
        {field("Website", websiteUrl, setWebsiteUrl, "https://", "url")}
        {field("GitHub", githubUrl, setGithubUrl, "https://github.com/", "url")}
        {field("Portfolio", portfolioUrl, setPortfolioUrl, "https://", "url")}
        <Action title={busy ? "Saving…" : "Save profile"} disabled={busy} onPress={() => void saveProfile()} />
      </View>
      <View style={s.panel}>
        <Text style={s.heading}>Social pages</Text>
        <Text style={s.copy}>Add public social links that appear on your MAS developer profile.</Text>
        {SOCIAL_FIELDS.map((item) => field(item.label, socials[item.key], (next) => setSocials((previous) => ({ ...previous, [item.key]: next })), item.placeholder, "url"))}
        <Action title={busy ? "Saving…" : "Save social pages"} disabled={busy} onPress={() => void saveSocials()} />
      </View>
    </> : null}
    <View style={s.actionSection}>
      <Text style={s.heading}>Account and security</Text>
      <Text style={s.copy}>Password, sign-in methods, sessions and account protection are handled by the authenticated MAS security workflow.</Text>
      <Action title="Open security settings" onPress={() => void open("/console/security")} />
      <Action title="Open account preferences" onPress={() => void open("/settings")} secondary />
    </View>
    <View style={s.actionSection}>
      <Text style={s.heading}>Public store presence</Text>
      <Text style={s.copy}>Manage profile photos, cover picture and the public details shoppers see in the store.</Text>
      <Action title="Manage store presence" onPress={() => void open("/console/store")} />
    </View>
    {message ? <Text accessibilityRole="alert" style={s.message}>{message}</Text> : null}
    <TouchableOpacity onPress={() => void load()} style={s.refresh}><Text style={s.backText}>Refresh settings</Text></TouchableOpacity>
  </ScrollView>;
}

function Action({ title, onPress, disabled, secondary }: { title: string; onPress: () => void; disabled?: boolean; secondary?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button, secondary && s.secondary, disabled && { opacity: 0.55 }]}><Text style={[s.buttonText, secondary && s.secondaryText]}>{title}</Text></TouchableOpacity>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F6F7FB" },
  content: { padding: 16, paddingBottom: 36 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  back: { paddingVertical: 8, marginBottom: 12 },
  backText: { color: "#1A73E8", fontSize: 13, fontWeight: "600" },
  eyebrow: { color: "#1A73E8", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  title: { color: "#111827", fontSize: 25, fontWeight: "700", marginTop: 4 },
  copy: { color: "#64748B", fontSize: 12, lineHeight: 18, marginTop: 6 },
  panel: { backgroundColor: "#FFF", borderRadius: 12, padding: 14, marginTop: 14, borderWidth: 1, borderColor: "#E7EBF3" },
  actionSection: { paddingVertical: 14, marginTop: 10, borderTopWidth: 1, borderTopColor: "#E5ECF5" },
  heading: { color: "#111827", fontSize: 15, fontWeight: "700", marginBottom: 8 },
  field: { marginTop: 9 },
  label: { color: "#64748B", fontSize: 11, fontWeight: "600" },
  input: { width: "100%", minHeight: 44, borderWidth: 1, borderColor: "#DCE2EA", borderRadius: 8, paddingHorizontal: 11, marginTop: 6, color: "#111827", backgroundColor: "#FFF" },
  bio: { minHeight: 96, paddingTop: 10 },
  helper: { color: "#64748B", fontSize: 11, marginTop: 5 },
  button: { alignSelf: "flex-start", backgroundColor: "#1A73E8", minHeight: 42, borderRadius: 8, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, marginTop: 12 },
  buttonText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  secondary: { backgroundColor: "#EFF4FA" },
  secondaryText: { color: "#1A73E8" },
  message: { color: "#334155", fontSize: 12, lineHeight: 18, marginTop: 12 },
  refresh: { paddingVertical: 15, alignItems: "center" },
});
