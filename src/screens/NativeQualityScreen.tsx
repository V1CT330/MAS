import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";
import { asoReport } from "../shared/mas-core";

type Props = {
  onBack: () => void;
  onStartListing: () => void;
  onSelectListing: (listingId: string) => void;
};

type QualityListing = {
  id: string;
  name: string;
  kind: string;
  status: string;
  tagline: string | null;
  description: string | null;
  category: string | null;
  icon_url: string | null;
  screenshots: string[] | null;
  website_url: string | null;
  banner_url: string | null;
  tags: string[] | null;
  rating_avg: number | null;
  downloads: number | null;
};

type Requirement = { label: string; hint: string; ok: boolean };

function submissionChecks(listing: QualityListing): Requirement[] {
  const website = listing.kind === "website";
  const checks: Requirement[] = [
    { label: "Product name", ok: (listing.name?.trim().length ?? 0) >= 3, hint: "At least 3 characters." },
    { label: "Short description", ok: (listing.tagline?.trim().length ?? 0) >= 20, hint: "One line, 20 characters or more." },
    { label: "Full description", ok: (listing.description?.trim().length ?? 0) >= 200, hint: "200 characters or more helps discovery." },
    { label: "Category", ok: Boolean(listing.category), hint: "Pick the closest category." },
    { label: website ? "Logo or thumbnail" : "App icon", ok: Boolean(listing.icon_url), hint: "Square image, at least 512px." },
    { label: website ? "Preview screenshots" : "Screenshots", ok: (listing.screenshots?.length ?? 0) >= 2, hint: "Add at least 2 images." },
  ];
  if (website) {
    checks.push({
      label: "Website address",
      ok: /^https?:\/\/.+\..+/.test(listing.website_url ?? ""),
      hint: "Full URL starting with https://",
    });
  }
  return checks;
}

const statusLabel = (status: string) =>
  status === "published" ? "Live" : status === "pending" ? "In review" : status.charAt(0).toUpperCase() + status.slice(1);

export default function NativeQualityScreen({ onBack, onSelectListing }: Props) {
  const [listings, setListings] = useState<QualityListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestGeneration.current;
    setLoading(true);
    setError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (requestId !== requestGeneration.current) return;
      if (authError || !auth.user) throw new Error(authError?.message || "Sign in to review listing quality.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("mode")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (requestId !== requestGeneration.current) return;
      if (profileError) throw profileError;
      if (profile?.mode !== "developer") throw new Error("Developer workspace access is no longer active.");

      const { data, error: listingsError } = await supabase
        .from("listings")
        .select("id,name,kind,status,tagline,description,category,icon_url,screenshots,website_url,banner_url,tags,rating_avg,downloads")
        .eq("developer_id", auth.user.id)
        .order("updated_at", { ascending: false });
      if (requestId !== requestGeneration.current) return;
      if (listingsError) throw listingsError;
      setListings((data ?? []) as QualityListing[]);
    } catch (cause) {
      if (requestId !== requestGeneration.current) return;
      setListings([]);
      setError(cause instanceof Error ? cause.message : "Could not load listing quality. Check your connection and try again.");
    } finally {
      if (requestId === requestGeneration.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestGeneration.current += 1; };
  }, [load]);

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <TouchableOpacity accessibilityRole="button" onPress={onBack} style={styles.back}>
        <Text style={styles.backText}>‹ Developer dashboard</Text>
      </TouchableOpacity>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>DEVELOPER WORKSPACE</Text>
        <Text style={styles.title}>Quality</Text>
        <Text style={styles.copy}>How complete and discoverable each listing is right now.</Text>
      </View>

      {loading ? <ActivityIndicator color="#1A73E8" style={styles.loader} /> : error ? (
        <View style={styles.messageBlock}>
          <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => void load()} style={styles.retry}>
            <Text style={styles.backText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : listings.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.listingTitle}>No products to check yet</Text>
          <Text style={styles.copy}>Once you create a listing, its readiness and optimisation checks appear here.</Text>
          <TouchableOpacity accessibilityRole="button" onPress={onStartListing} style={styles.retry}>
            <Text style={styles.backText}>Start a listing</Text>
          </TouchableOpacity>
        </View>
      ) : listings.map((listing) => {
        const requirements = submissionChecks(listing);
        const readiness = Math.round((requirements.filter((item) => item.ok).length / requirements.length) * 100);
        const optimisation = asoReport(listing);
        const missing = requirements.filter((item) => !item.ok);
        return (
          <View key={listing.id} style={styles.listing}>
            <View style={styles.listingHeader}>
              <View style={styles.listingCopy}>
                <Text style={styles.listingTitle}>{listing.name}</Text>
                <Text style={styles.copy}>{listing.kind.replace("_", " ")} · {statusLabel(listing.status)}</Text>
              </View>
              <TouchableOpacity accessibilityRole="button" onPress={() => onSelectListing(listing.id)} style={styles.open}>
                <Text style={styles.openText}>Open ›</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.scoreBlock}>
              <View style={styles.scoreHeader}><Text style={styles.scoreLabel}>Listing readiness</Text><Text style={styles.scoreValue}>{readiness}%</Text></View>
              <View style={styles.track}><View style={[styles.progress, { width: `${readiness}%` as `${number}%` }]} /></View>
            </View>
            <View style={styles.scoreBlock}>
              <View style={styles.scoreHeader}><Text style={styles.scoreLabel}>Store optimisation</Text><Text style={styles.scoreValue}>{optimisation.score}%</Text></View>
              <View style={styles.track}><View style={[styles.progress, styles.optimisationProgress, { width: `${optimisation.score}%` as `${number}%` }]} /></View>
            </View>
            {missing.length ? (
              <View style={styles.missingList}>
                {missing.slice(0, 4).map((item) => <Text key={item.label} style={styles.missingItem}>• {item.label}: {item.hint}</Text>)}
              </View>
            ) : <Text style={styles.complete}>All submission requirements are met.</Text>}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 36, gap: 14 },
  back: { alignSelf: "flex-start", paddingVertical: 8 },
  backText: { color: "#1A73E8", fontSize: 13, fontWeight: "600" },
  header: { gap: 3, marginBottom: 4 },
  eyebrow: { color: "#5F78A0", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  title: { color: "#202A3A", fontSize: 24, fontWeight: "700", marginTop: 4 },
  copy: { color: "#66758A", fontSize: 12, lineHeight: 18, marginTop: 4 },
  loader: { marginVertical: 24 },
  listing: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: "#E5ECF5", gap: 13 },
  listingHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  listingCopy: { flex: 1, minWidth: 0 },
  listingTitle: { color: "#27364A", fontSize: 15, fontWeight: "700" },
  open: { paddingVertical: 7, paddingHorizontal: 9 },
  openText: { color: "#1A73E8", fontSize: 12, fontWeight: "700" },
  scoreBlock: { gap: 6 },
  scoreHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scoreLabel: { color: "#66758A", fontSize: 11, fontWeight: "600" },
  scoreValue: { color: "#27364A", fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  track: { height: 7, backgroundColor: "#E8EEF7", overflow: "hidden", borderRadius: 4 },
  progress: { height: 7, backgroundColor: "#1A73E8", borderRadius: 4 },
  optimisationProgress: { backgroundColor: "#26966D" },
  missingList: { gap: 5, paddingTop: 2 },
  missingItem: { color: "#66758A", fontSize: 11, lineHeight: 16 },
  complete: { color: "#217653", fontSize: 11, fontWeight: "600" },
  empty: { paddingVertical: 20, gap: 8 },
  messageBlock: { paddingVertical: 12, gap: 8 },
  error: { color: "#9A3412", fontSize: 12, lineHeight: 18 },
  retry: { alignSelf: "flex-start", paddingVertical: 8 },
});
