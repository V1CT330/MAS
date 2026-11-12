import React, { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { CATEGORIES, slugify, type ListingKind } from "../shared/mas-core";
import { supabase } from "../lib/supabase";

type Props = { onSaved: (listing: { id: string; name: string; kind: ListingKind }) => void };
type PickedImage = ImagePicker.ImagePickerAsset;

async function uploadLocalAsset(userId: string, uri: string, fileName: string, folder: string, contentType?: string) {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("Could not read the selected file.");
  const body = await response.arrayBuffer();
  if (!body.byteLength) throw new Error("The selected file is empty.");
  const extension = fileName.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = userId + "/" + folder + "/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + extension;
  const { error } = await supabase.storage.from("app-assets").upload(path, body, {
    upsert: false,
    contentType: contentType || "application/octet-stream",
  });
  if (error) throw error;
  return path;
}

export default function NativePublishingScreen({ onSaved }: Props) {
  const [kind, setKind] = useState<ListingKind>("app");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [packageFile, setPackageFile] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [icon, setIcon] = useState<PickedImage | null>(null);
  const [screenshots, setScreenshots] = useState<PickedImage[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const choosePackage = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: kind === "app"
        ? ["application/vnd.android.package-archive", "application/octet-stream"]
        : ["application/zip", "application/x-zip-compressed"],
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    const extension = asset.name.split(".").pop()?.toLowerCase();
    if (extension !== (kind === "app" ? "apk" : "zip")) {
      setMessage(kind === "app" ? "Choose an APK file." : "Choose a ZIP package.");
      return;
    }
    if (!asset.size || asset.size > 50 * 1024 * 1024) {
      setMessage("Package must be larger than 0 bytes and no larger than 50 MB.");
      return;
    }
    setPackageFile(asset);
    setMessage("Package selected.");
  };

  const chooseImages = async (target: "icon" | "screenshots") => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: target === "screenshots",
      selectionLimit: target === "screenshots" ? 8 : 1,
      quality: 0.9,
    });
    if (result.canceled) return;
    const selected = result.assets.filter((item) => item.uri && item.fileSize !== 0 && (item.fileSize ?? 0) <= 10 * 1024 * 1024);
    if (selected.length !== result.assets.length) {
      setMessage("Each image must be larger than 0 bytes and no larger than 10 MB.");
      return;
    }
    if (target === "icon") setIcon(selected[0] ?? null);
    else setScreenshots(selected.slice(0, 8));
    setMessage(target === "icon" ? "Icon selected." : selected.length + " screenshot(s) selected.");
  };

  const saveDraft = async () => {
    const cleanName = name.trim();
    if (cleanName.length < 3) { setMessage("Give your listing a name of at least 3 characters."); return; }
    if (kind === "website" && !/^https:\/\//i.test(websiteUrl.trim())) { setMessage("Enter a secure website URL starting with https://."); return; }
    if (kind !== "website" && !packageFile) { setMessage("Choose the required package file first."); return; }
    if (!version.trim()) { setMessage("Enter a version number."); return; }
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) { setMessage("Sign in to create a listing."); return; }

    setSaving(true);
    const uploaded: string[] = [];
    let listingId: string | null = null;
    try {
      const userId = authData.user.id;
      const iconPath = icon ? await uploadLocalAsset(userId, icon.uri, icon.fileName || "icon.jpg", "icons", icon.mimeType || "image/jpeg") : null;
      if (iconPath) uploaded.push(iconPath);
      const screenshotPaths: string[] = [];
      for (let i = 0; i < screenshots.length; i += 1) {
        const item = screenshots[i];
        const assetPath = await uploadLocalAsset(userId, item.uri, item.fileName || ("screenshot-" + (i + 1) + ".jpg"), "screenshots", item.mimeType || "image/jpeg");
        screenshotPaths.push(assetPath);
        uploaded.push(assetPath);
      }

      const slug = slugify(cleanName) + "-" + Math.random().toString(36).slice(2, 6);
      const { data: listing, error: listingError } = await supabase.from("listings").insert({
        developer_id: userId,
        slug,
        name: cleanName,
        tagline: tagline.trim() || null,
        description: description.trim() || null,
        category,
        kind,
        icon_url: iconPath,
        screenshots: screenshotPaths,
        website_url: kind === "website" ? websiteUrl.trim() : null,
        status: "draft",
      }).select("id").single();
      if (listingError || !listing) throw listingError || new Error("Could not create the listing draft.");
      listingId = listing.id;

      let packagePath: string | null = null;
      if (packageFile && kind !== "website") {
        packagePath = await uploadLocalAsset(userId, packageFile.uri, packageFile.name, "builds", packageFile.mimeType || "application/octet-stream");
        uploaded.push(packagePath);
      }
      const { error: versionError } = await supabase.from("listing_versions").insert({
        listing_id: listing.id,
        version: version.trim(),
        changelog: "First release",
        file_url: packagePath,
        size_bytes: packageFile?.size ?? null,
        status: kind === "website" ? "released" : "pending",
      });
      if (versionError) throw versionError;
      await supabase.from("profiles").update({ is_developer: true }).eq("id", userId);
      setMessage("Draft saved. Complete the publishing checklist and submit it for review.");
      onSaved({ id: listing.id, name: cleanName, kind });
    } catch (error) {
      if (listingId) {
        const { error: cleanupError } = await supabase.from("listings").delete().eq("id", listingId);
        if (cleanupError) setMessage("Upload failed. The incomplete draft could not be removed. Check your products before retrying.");
      }
      if (uploaded.length) {
        const { error: cleanupError } = await supabase.storage.from("app-assets").remove(uploaded);
        if (cleanupError) setMessage("Upload failed. Some unused files may remain in storage.");
      }
      if (!message.includes("could not be removed") && !message.includes("unused files")) {
        setMessage(error instanceof Error ? error.message : "Could not save this listing draft.");
      }
    } finally {
      setSaving(false);
    }
  };

  const kinds: { value: ListingKind; label: string }[] = [
    { value: "app", label: "App" },
    { value: "website", label: "Website" },
    { value: "ai_agent", label: "AI agent" },
    { value: "extension", label: "Browser extension" },
  ];

  return <View style={styles.content}>
    <View style={styles.intro}>
      <Text style={styles.eyebrow}>PUBLISHING</Text>
      <Text style={styles.heading}>Create a listing</Text>
      <Text style={styles.subheading}>Start with a draft. You can complete the checklist and request review after saving.</Text>
    </View>
    <View style={styles.panel}>
      <Text style={styles.label}>Listing type</Text>
      <View style={styles.wrap}>
        {kinds.map((item) => <TouchableOpacity key={item.value} onPress={() => { setKind(item.value); setPackageFile(null); }} style={[styles.chip, kind === item.value && styles.chipActive]}>
          <Text style={[styles.chipText, kind === item.value && styles.chipTextActive]}>{item.label}</Text>
        </TouchableOpacity>)}
      </View>
      <Text style={styles.label}>Name</Text>
      <TextInput value={name} onChangeText={setName} maxLength={60} placeholder="Listing name" style={styles.input} />
      <Text style={styles.label}>Tagline</Text>
      <TextInput value={tagline} onChangeText={setTagline} maxLength={90} placeholder="One line about your product" style={styles.input} />
      <Text style={styles.label}>Description</Text>
      <TextInput value={description} onChangeText={setDescription} maxLength={2000} multiline numberOfLines={5} textAlignVertical="top" placeholder="Describe what it does and who it helps" style={[styles.input, styles.multiline]} />
      <Text style={styles.label}>Category</Text>
      <View style={styles.wrap}>
        {CATEGORIES.map((item) => <TouchableOpacity key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipActive]}>
          <Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text>
        </TouchableOpacity>)}
      </View>
      {kind === "website" ? <>
        <Text style={styles.label}>Website URL</Text>
        <TextInput value={websiteUrl} onChangeText={setWebsiteUrl} autoCapitalize="none" keyboardType="url" placeholder="https://example.mw" style={styles.input} />
      </> : <>
        <Text style={styles.label}>{kind === "app" ? "Android APK package" : "ZIP package"}</Text>
        <TouchableOpacity style={styles.fileButton} onPress={() => void choosePackage()}>
          <Text style={styles.fileTitle}>{packageFile?.name || "Choose package"}</Text>
          <Text style={styles.helper}>{packageFile ? ((packageFile.size ?? 0) / 1048576).toFixed(1) + " MB selected" : "Maximum size 50 MB"}</Text>
        </TouchableOpacity>
      </>}
      <Text style={styles.label}>Icon</Text>
      <TouchableOpacity style={styles.fileButton} onPress={() => void chooseImages("icon")}>
        <Text style={styles.fileTitle}>{icon?.fileName || "Choose icon image"}</Text>
        <Text style={styles.helper}>Optional · 10 MB maximum</Text>
      </TouchableOpacity>
      <Text style={styles.label}>Screenshots</Text>
      <TouchableOpacity style={styles.fileButton} onPress={() => void chooseImages("screenshots")}>
        <Text style={styles.fileTitle}>{screenshots.length ? screenshots.length + " screenshot(s) selected" : "Choose screenshots"}</Text>
        <Text style={styles.helper}>Optional while drafting · Up to 8 images · 10 MB each</Text>
      </TouchableOpacity>
      <Text style={styles.label}>Version</Text>
      <TextInput value={version} onChangeText={setVersion} autoCapitalize="none" placeholder="1.0.0" style={styles.input} />
      <TouchableOpacity disabled={saving} onPress={() => void saveDraft()} style={[styles.primaryButton, saving && styles.disabled]}>
        {saving ? <ActivityIndicator color="#FFF" /> : <Text style={styles.primaryText}>Save draft</Text>}
      </TouchableOpacity>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 36 },
  intro: { marginBottom: 14 },
  eyebrow: { color: "#5F6B7A", fontSize: 10, fontWeight: "700", letterSpacing: 1.1 },
  heading: { color: "#202124", fontSize: 23, fontWeight: "700", marginTop: 4 },
  subheading: { color: "#5F6368", fontSize: 13, lineHeight: 19, marginTop: 6 },
  panel: { backgroundColor: "#FFF", borderWidth: 1, borderColor: "#E8EAED", borderRadius: 16, padding: 16 },
  label: { color: "#3C4043", fontSize: 12, fontWeight: "700", marginTop: 13, marginBottom: 7 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderWidth: 1, borderColor: "#DADCE0", backgroundColor: "#FFF", borderRadius: 22, paddingHorizontal: 13, paddingVertical: 9 },
  chipActive: { backgroundColor: "#E8F0FE", borderColor: "#D2E3FC" },
  chipText: { color: "#5F6368", fontSize: 12, fontWeight: "600" },
  chipTextActive: { color: "#174EA6" },
  input: { minHeight: 46, borderWidth: 1, borderColor: "#DADCE0", borderRadius: 11, paddingHorizontal: 12, color: "#202124", backgroundColor: "#FFF", marginBottom: 4 },
  multiline: { minHeight: 110, paddingTop: 12 },
  fileButton: { borderWidth: 1, borderColor: "#DADCE0", borderRadius: 12, padding: 13, backgroundColor: "#FFF", minHeight: 64, justifyContent: "center" },
  fileTitle: { color: "#202124", fontSize: 13, fontWeight: "600" },
  helper: { color: "#5F6368", fontSize: 11, marginTop: 4 },
  primaryButton: { minHeight: 48, borderRadius: 24, backgroundColor: "#1A73E8", alignItems: "center", justifyContent: "center", marginTop: 18 },
  primaryText: { color: "#FFF", fontSize: 14, fontWeight: "700" },
  disabled: { opacity: 0.6 },
  message: { color: "#3C4043", fontSize: 12, lineHeight: 18, marginTop: 12 },
});
