import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { supabase } from "../lib/supabase";

const WEB = "https://malawian-app-store.vercel.app";
const PROFILE_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"]);
const PROFILE_IMAGE_MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "image/heif": "heif",
};
const MAX_COVER_IMAGE_BYTES = 8 * 1024 * 1024;
type Props = { onBack: () => void };
type ProfileImageTarget = "avatar" | "cover";
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
  avatar_url: string | null;
  cover_image_url: string | null;
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
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
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
        .select("display_name,developer_name,company_name,bio,skills,location,contact_email,website_url,github_url,portfolio_url,avatar_url,cover_image_url,facebook_url,x_url,linkedin_url,instagram_url,youtube_url,whatsapp_url")
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
      if (row?.avatar_url) {
        const { data: avatarData } = await supabase.storage.from("app-assets").createSignedUrl(row.avatar_url, 60 * 60);
        setAvatarPreview(avatarData?.signedUrl ?? null);
      } else {
        setAvatarPreview(null);
      }
      if (row?.cover_image_url) {
        const { data: coverData } = await supabase.storage.from("app-assets").createSignedUrl(row.cover_image_url, 60 * 60);
        setCoverPreview(coverData?.signedUrl ?? null);
      } else {
        setCoverPreview(null);
      }
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

  const chooseProfileImage = async (target: ProfileImageTarget) => {
    if (!userId) return;
    const setUploading = target === "avatar" ? setUploadingAvatar : setUploadingCover;
    setUploading(true);
    setMessage("");
    let uploadedPath: string | null = null;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error("Allow photo-library access to choose a profile image.");
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: target === "cover" ? [16, 9] : [1, 1],
        quality: 0.9,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      const mimeType = (asset.mimeType ?? "").split(";")[0].trim().toLowerCase();
      const namedExtension = asset.fileName?.split(".").pop()?.toLowerCase() ?? "";
      const extension = PROFILE_IMAGE_EXTENSIONS.has(namedExtension)
        ? namedExtension
        : PROFILE_IMAGE_MIME_EXTENSIONS[mimeType];
      if (!asset.uri || !mimeType.startsWith("image/") || !extension || !PROFILE_IMAGE_EXTENSIONS.has(extension)) {
        throw new Error("Choose a supported JPG, PNG, WebP, GIF, AVIF or HEIC image.");
      }

      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error("Could not read the selected image.");
      const body = await response.arrayBuffer();
      if (!body.byteLength) throw new Error("The selected image is empty.");
      if (target === "cover" && body.byteLength > MAX_COVER_IMAGE_BYTES) {
        throw new Error("Cover images must be 8 MB or smaller.");
      }

      const folder = target === "cover" ? "profile-covers" : "avatars";
      const path = userId + "/" + folder + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + extension;
      const { error: uploadError } = await supabase.storage.from("app-assets").upload(path, body, {
        upsert: false,
        contentType: mimeType,
      });
      if (uploadError) throw uploadError;
      uploadedPath = path;

      const column = target === "cover" ? "cover_image_url" : "avatar_url";
      const { error: profileError } = await supabase.from("profiles").update({ [column]: path }).eq("id", userId);
      if (profileError) throw profileError;
      uploadedPath = null;

      const { data: signedData, error: signedError } = await supabase.storage.from("app-assets").createSignedUrl(path, 60 * 60);
      if (target === "cover") setCoverPreview(signedData?.signedUrl ?? null);
      else setAvatarPreview(signedData?.signedUrl ?? null);
      setMessage(signedError
        ? "Image saved. Refresh settings if its preview does not appear."
        : target === "cover" ? "Cover picture updated." : "Profile photo updated.");
    } catch (error) {
      if (uploadedPath) {
        const { error: cleanupError } = await supabase.storage.from("app-assets").remove([uploadedPath]);
        if (cleanupError) console.warn("Could not remove an unlinked profile image.");
      }
      setMessage(error instanceof Error ? error.message : "Could not update the profile image.");
    } finally {
      setUploading(false);
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
      <Text style={s.copy}>Update the images shown on your public developer page. Cover pictures are limited to 8 MB.</Text>
      <View style={s.coverFrame}>
        {coverPreview
          ? <Image source={{ uri: coverPreview }} style={s.coverImage} />
          : <View style={s.coverPlaceholder}><Text style={s.placeholderText}>No cover picture selected</Text></View>}
      </View>
      <Action
        title={uploadingCover ? "Uploading cover…" : coverPreview ? "Change cover picture" : "Add cover picture"}
        disabled={busy || uploadingCover || uploadingAvatar}
        onPress={() => void chooseProfileImage("cover")}
      />
      <View style={s.avatarRow}>
        {avatarPreview
          ? <Image source={{ uri: avatarPreview }} style={s.avatarImage} />
          : <View style={s.avatarPlaceholder}><Text style={s.placeholderText}>Photo</Text></View>}
        <View style={s.avatarInfo}>
          <Text style={s.avatarName}>{developerName || displayName || "Your developer profile"}</Text>
          <Text style={s.copy}>Public profile photo</Text>
          <Action
            title={uploadingAvatar ? "Uploading photo…" : avatarPreview ? "Change profile photo" : "Add profile photo"}
            disabled={busy || uploadingAvatar || uploadingCover}
            onPress={() => void chooseProfileImage("avatar")}
          />
        </View>
      </View>
      <Action title="View public developer page" secondary onPress={() => void open("/developers/" + userId)} />
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
  coverFrame: { width: "100%", height: 136, overflow: "hidden", borderRadius: 8, backgroundColor: "#E8EDF5", marginTop: 12 },
  coverImage: { width: "100%", height: "100%", resizeMode: "cover" },
  coverPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center" },
  placeholderText: { color: "#64748B", fontSize: 12 },
  avatarRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
  avatarImage: { width: 64, height: 64, borderRadius: 32, backgroundColor: "#E8EDF5" },
  avatarPlaceholder: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", backgroundColor: "#E8EDF5" },
  avatarInfo: { flex: 1, minWidth: 0 },
  avatarName: { color: "#111827", fontSize: 13, fontWeight: "700" },
  refresh: { paddingVertical: 15, alignItems: "center" },
});
