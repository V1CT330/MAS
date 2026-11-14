import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { supabase } from "../lib/supabase";

type Props = { onBack: () => void };
type KycStatus = "none" | "pending" | "approved" | "rejected" | string;
const WEB = "https://malawian-app-store.vercel.app";
// Manual uploads stay hidden until the production private KYC storage bucket is provisioned.
const MANUAL_KYC_UPLOAD_ENABLED = false;

async function uploadDocument(userId: string, asset: DocumentPicker.DocumentPickerAsset) {
  const response = await fetch(asset.uri);
  if (!response.ok) throw new Error("Could not read the selected identity document.");
  const body = await response.arrayBuffer();
  if (!body.byteLength || body.byteLength > 10 * 1024 * 1024) throw new Error("Identity document must be larger than 0 bytes and no larger than 10 MB.");
  const extension = asset.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const path = userId + "/kyc/" + Date.now() + "-" + Math.random().toString(36).slice(2, 8) + "." + extension;
  const { error } = await supabase.storage.from("kyc-docs").upload(path, body, {
    upsert: false,
    contentType: asset.mimeType || "application/octet-stream",
  });
  if (error) throw error;
  return path;
}

export default function NativeVerificationScreen({ onBack }: Props) {
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<KycStatus>("none");
  const [phone, setPhone] = useState("");
  const [fullName, setFullName] = useState("");
  const [idType, setIdType] = useState("National ID");
  const [idNumber, setIdNumber] = useState("");
  const [document, setDocument] = useState<DocumentPicker.DocumentPickerAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      setUserId(null);
      setMessage(authError?.message || "Sign in to manage developer verification.");
      setLoading(false);
      return;
    }
    setUserId(auth.user.id);
    const [profileResult, submissionResult] = await Promise.all([
      supabase.from("profiles").select("phone,kyc_status,is_developer,mode").eq("id", auth.user.id).maybeSingle(),
      supabase.from("kyc_submissions").select("status,created_at").eq("user_id", auth.user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (profileResult.error) setMessage(profileResult.error.message);
    else if (!profileResult.data?.is_developer && profileResult.data?.mode !== "developer") setMessage("Activate your developer account before starting verification.");
    else {
      setPhone(profileResult.data.phone || "");
      // The profile status is server-authoritative. A manual submission is shown as pending
      // when its row is pending, without letting the mobile client change KYC status.
      const profileStatus = profileResult.data.kyc_status || "none";
      const submissionStatus = submissionResult.data?.status;
      setStatus(profileStatus === "none" && submissionStatus === "pending" ? "pending" : profileStatus);
      if (submissionResult.error) setMessage(submissionResult.error.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const chooseDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ["image/*", "application/pdf"], copyToCacheDirectory: true, multiple: false });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.size || asset.size > 10 * 1024 * 1024) {
        setMessage("Choose an image or PDF up to 10 MB.");
        return;
      }
      setDocument(asset);
      setMessage("Identity document selected.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not open the document picker.");
    }
  };

  const savePhone = async () => {
    const normalized = phone.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setMessage("Enter a valid international number, for example +265991234567.");
      return;
    }
    if (!userId) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.from("profiles").update({ phone: normalized }).eq("id", userId);
      if (error) throw error;
      setMessage("WhatsApp contact number saved. This does not verify your identity.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save your number.");
    } finally { setBusy(false); }
  };

  const submitManual = async () => {
    if (!userId) return;
    if (fullName.trim().length < 3) { setMessage("Enter your full legal name."); return; }
    if (idNumber.trim().length < 4) { setMessage("Enter a valid document number."); return; }
    if (!document) { setMessage("Attach a national ID or passport photo, or a PDF."); return; }
    setBusy(true);
    setMessage("");
    let uploaded: string | null = null;
    try {
      uploaded = await uploadDocument(userId, document);
      const { error } = await supabase.from("kyc_submissions").insert({
        user_id: userId,
        full_name: fullName.trim(),
        id_type: idType.trim(),
        id_number: idNumber.trim(),
        document_url: uploaded,
        status: "pending",
      });
      if (error) throw error;
      // The server/admin review flow owns profiles.kyc_status.
      setStatus("pending");
      setDocument(null);
      setMessage("Verification submitted for manual review.");
    } catch (error) {
      if (uploaded) await supabase.storage.from("kyc-docs").remove([uploaded]);
      setMessage(error instanceof Error ? error.message : "Could not submit verification.");
    } finally { setBusy(false); }
  };

  const startDidit = async () => {
    if (!userId) return;
    setBusy(true);
    setMessage("");
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      const token = data.session?.access_token;
      if (!token) throw new Error("Your session has expired. Sign in again.");
      const response = await fetch(WEB + "/api/public/didit/session", {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const result = await response.json().catch(() => ({})) as { url?: string; error?: string };
      if (!response.ok) throw new Error(result.error || "Could not start Didit verification.");
      if (!result.url) throw new Error("Didit did not return a verification link.");
      const verificationUrl = new URL(result.url);
      if (verificationUrl.protocol !== "https:" || !(verificationUrl.hostname === "verify.didit.me" || verificationUrl.hostname.endsWith(".didit.me"))) {
        throw new Error("Didit returned an unexpected verification link.");
      }
      await Linking.openURL(verificationUrl.toString());
      setMessage("Didit opened securely. MAS updates your status after the provider result is received and validated. Return here and refresh your status.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not start automatic verification.");
    } finally { setBusy(false); }
  };

  const statusLabel = status === "approved" ? "Verified" : status === "pending" ? "Pending review" : status === "rejected" ? "Needs attention" : "Not started";

  if (loading) return <View style={s.center}><ActivityIndicator color="#1A73E8" /></View>;
  return <ScrollView style={s.root} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
    <TouchableOpacity onPress={onBack} style={s.back}><Text style={s.backText}>‹  Developer dashboard</Text></TouchableOpacity>
    <Text style={s.eyebrow}>DEVELOPER ACCOUNT</Text>
    <Text style={s.title}>Verification</Text>
    <Text style={s.copy}>Verify your identity to build trust with users and meet MAS publishing requirements.</Text>
    <View style={s.panel}>
      <Text style={s.label}>Current status</Text>
      <Text style={s.status}>{statusLabel}</Text>
      {status === "approved" ? <Text style={s.copy}>Your developer identity is verified. You do not need to submit another application.</Text> : status === "pending" ? <Text style={s.copy}>Your verification is awaiting review. Do not submit duplicate documents.</Text> : status === "rejected" ? <Text style={s.copy}>Your previous submission needs attention. Contact MAS support if you need clarification before resubmitting.</Text> : <Text style={s.copy}>Choose manual document review or secure automatic verification through Didit.</Text>}
    </View>
    <View style={s.panel}>
      <Text style={s.heading}>WhatsApp contact</Text>
      <Text style={s.copy}>Contact information only. Saving a phone number does not verify your identity.</Text>
      <TextInput value={phone} onChangeText={setPhone} placeholder="+265991234567" keyboardType="phone-pad" autoComplete="tel" style={s.input} />
      <Action title="Save number" disabled={busy} onPress={() => void savePhone()} />
    </View>
    {MANUAL_KYC_UPLOAD_ENABLED && status !== "approved" ? <View style={s.panel}>
      <Text style={s.heading}>Manual identity review</Text>
      <Text style={s.copy}>Submit your legal name and a clear national ID or passport document. Files are limited to 10 MB.</Text>
      <TextInput value={fullName} onChangeText={setFullName} maxLength={80} placeholder="Full legal name" style={s.input} />
      <TextInput value={idType} onChangeText={setIdType} maxLength={40} placeholder="Document type" style={s.input} />
      <TextInput value={idNumber} onChangeText={setIdNumber} maxLength={40} placeholder="Document number" style={s.input} />
      <TouchableOpacity onPress={() => void chooseDocument()} style={s.file}><Text style={s.fileText}>{document?.name || "Choose national ID or passport"}</Text></TouchableOpacity>
      <Action title={busy ? "Submitting…" : "Submit for verification"} disabled={busy || status === "pending"} onPress={() => void submitManual()} />
    </View> : null}
    {!MANUAL_KYC_UPLOAD_ENABLED && status !== "approved" && status !== "pending" ? <Text style={s.note}>Manual document upload is temporarily unavailable while secure document storage is being provisioned. Use Didit instead.</Text> : null}
    {status !== "approved" && status !== "pending" ? <View style={s.panel}>
      <Text style={s.heading}>Automatic verification</Text>
      <Text style={s.copy}>Didit handles identity capture in its secure hosted flow. MAS changes your status only after the verified provider result is received.</Text>
      <Action title={busy ? "Preparing Didit…" : "Verify with Didit"} disabled={busy} onPress={() => void startDidit()} />
    </View> : null}
    <TouchableOpacity disabled={busy} onPress={() => void refresh()} style={s.refresh}><Text style={s.refreshText}>Refresh verification status</Text></TouchableOpacity>
    {message ? <Text accessibilityRole="alert" style={s.message}>{message}</Text> : null}
    <Text style={s.note}>Verification is free and separate from Developer Pro. A paid subscription cannot purchase a verified badge.</Text>
  </ScrollView>;
}

function Action({ title, onPress, disabled }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button, disabled && s.disabled]}><Text style={s.buttonText}>{title}</Text></TouchableOpacity>;
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
  label: { color: "#64748B", fontSize: 11, fontWeight: "600" },
  status: { color: "#111827", fontSize: 19, fontWeight: "700", marginTop: 4 },
  heading: { color: "#111827", fontSize: 15, fontWeight: "700" },
  input: { minHeight: 44, borderWidth: 1, borderColor: "#DCE2EA", borderRadius: 9, paddingHorizontal: 11, marginTop: 10, color: "#111827", backgroundColor: "#FFF" },
  file: { minHeight: 44, borderWidth: 1, borderColor: "#DCE2EA", borderRadius: 9, paddingHorizontal: 11, justifyContent: "center", marginTop: 10 },
  fileText: { color: "#475569", fontSize: 12 },
  button: { backgroundColor: "#1A73E8", minHeight: 42, borderRadius: 9, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, marginTop: 12 },
  buttonText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  disabled: { opacity: 0.55 },
  refresh: { paddingVertical: 15, alignItems: "center" },
  refreshText: { color: "#1A73E8", fontSize: 12, fontWeight: "700" },
  message: { color: "#334155", fontSize: 12, lineHeight: 18, marginTop: 8 },
  note: { color: "#64748B", fontSize: 11, lineHeight: 17, marginTop: 8 },
});
