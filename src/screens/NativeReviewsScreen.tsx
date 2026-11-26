import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";

type Props = {
  onBack: () => void;
  onSelectListing: (listingId: string) => void;
};
type Listing = { id: string; name: string };
type Review = {
  id: string;
  rating: number;
  body: string | null;
  developer_reply: string | null;
  listing_id: string;
  created_at: string;
};

export default function NativeReviewsScreen({ onBack, onSelectListing }: Props) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error(authError?.message || "Sign in to view product reviews.");

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("mode")
        .eq("id", auth.user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (profile?.mode !== "developer") throw new Error("Developer workspace access is no longer active.");

      const { data: listingRows, error: listingError } = await supabase
        .from("listings")
        .select("id,name")
        .eq("developer_id", auth.user.id)
        .order("updated_at", { ascending: false });
      if (listingError) throw listingError;
      const ownListings = (listingRows ?? []) as Listing[];
      setListings(ownListings);

      if (ownListings.length === 0) {
        setReviews([]);
        return;
      }

      const { data: reviewRows, error: reviewError } = await supabase
        .from("reviews")
        .select("id,rating,body,developer_reply,listing_id,created_at")
        .in("listing_id", ownListings.map((listing) => listing.id))
        .order("created_at", { ascending: false })
        .limit(100);
      if (reviewError) throw reviewError;
      setReviews((reviewRows ?? []) as Review[]);
    } catch (cause) {
      setListings([]);
      setReviews([]);
      setError(cause instanceof Error ? cause.message : "Could not load reviews. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const average = useMemo(() => reviews.length
    ? (reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / reviews.length).toFixed(1)
    : "—", [reviews]);
  const unanswered = reviews.filter((review) => !review.developer_reply?.trim()).length;
  const nameOf = (id: string) => listings.find((listing) => listing.id === id)?.name ?? "Product";

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <TouchableOpacity accessibilityRole="button" onPress={onBack} style={styles.back}>
        <Text style={styles.backText}>‹ Developer dashboard</Text>
      </TouchableOpacity>
      <Text style={styles.eyebrow}>PRODUCT FEEDBACK</Text>
      <Text style={styles.title}>Reviews</Text>
      <Text style={styles.description}>Ratings and feedback across your products, newest first.</Text>

      <View style={styles.metrics}>
        <Metric label="Reviews" value={String(reviews.length)} />
        <Metric label="Average rating" value={average} />
        <Metric label="Awaiting reply" value={String(unanswered)} />
      </View>

      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><Action title="Try again" onPress={() => void load()} /></View> : null}
      {loading ? <ActivityIndicator color="#1877F2" style={styles.loader} /> : reviews.length === 0 && !error ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>{listings.length ? "No reviews yet" : "No products published yet"}</Text>
          <Text style={styles.description}>{listings.length ? "Reviews will appear here when people rate your products." : "Publish your first product to start receiving feedback."}</Text>
        </View>
      ) : (
        <View style={styles.list}>
          {reviews.map((review) => (
            <View key={review.id} style={styles.review}>
              <View style={styles.reviewTop}>
                <Text style={styles.stars}>{"★".repeat(Math.max(0, Math.min(5, Math.round(Number(review.rating) || 0)))}{"☆".repeat(5 - Math.max(0, Math.min(5, Math.round(Number(review.rating) || 0))))}</Text>
                <Text style={styles.date}>{new Date(review.created_at).toLocaleDateString()}</Text>
              </View>
              <Text style={styles.product}>{nameOf(review.listing_id)}</Text>
              {review.body?.trim() ? <Text style={styles.body}>{review.body.trim()}</Text> : <Text style={styles.muted}>No written comment.</Text>}
              <View style={styles.replyRow}>
                <Text style={[styles.replyStatus, review.developer_reply?.trim() ? styles.replied : styles.pending]}>
                  {review.developer_reply?.trim() ? "Replied" : "Awaiting reply"}
                </Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => onSelectListing(review.listing_id)} style={styles.openButton}>
                  <Text style={styles.openText}>Open product to reply ›</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <View style={styles.metric}><Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}
function Action({ title, onPress }: { title: string; onPress: () => void }) {
  return <TouchableOpacity accessibilityRole="button" onPress={onPress} style={styles.action}><Text style={styles.actionText}>{title}</Text></TouchableOpacity>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF" },
  content: { padding: 16, paddingBottom: 36 },
  back: { paddingVertical: 8, marginBottom: 12 },
  backText: { color: "#1765CC", fontSize: 13, fontWeight: "700" },
  eyebrow: { color: "#1765CC", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  title: { color: "#172B4D", fontSize: 26, fontWeight: "800", marginTop: 4 },
  description: { color: "#64748B", fontSize: 13, lineHeight: 19, marginTop: 5 },
  metrics: { flexDirection: "row", gap: 9, marginTop: 18, marginBottom: 18 },
  metric: { flex: 1, minHeight: 76, justifyContent: "center", padding: 11, borderRadius: 11, backgroundColor: "#F5F8FE", borderWidth: 1, borderColor: "#E4ECF8" },
  metricValue: { color: "#172B4D", fontSize: 20, fontWeight: "800" },
  metricLabel: { color: "#64748B", fontSize: 10, fontWeight: "600", marginTop: 4 },
  loader: { marginTop: 28 },
  empty: { padding: 18, backgroundColor: "#F7F9FC", borderRadius: 12, borderWidth: 1, borderColor: "#E8EEF7" },
  emptyTitle: { color: "#172B4D", fontSize: 15, fontWeight: "700" },
  list: { gap: 10 },
  review: { padding: 14, borderRadius: 12, borderWidth: 1, borderColor: "#E6ECF4", backgroundColor: "#FFFFFF" },
  reviewTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stars: { color: "#D69B20", fontSize: 15, letterSpacing: 1 },
  date: { color: "#8290A4", fontSize: 11 },
  product: { color: "#24364D", fontSize: 13, fontWeight: "700", marginTop: 9 },
  body: { color: "#3F4F64", fontSize: 13, lineHeight: 19, marginTop: 5 },
  muted: { color: "#8290A4", fontSize: 12, marginTop: 5 },
  replyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: "#EEF2F7" },
  replyStatus: { fontSize: 11, fontWeight: "700" },
  replied: { color: "#1765CC" },
  pending: { color: "#9A6700" },
  openButton: { minHeight: 36, justifyContent: "center", paddingHorizontal: 8 },
  openText: { color: "#1765CC", fontSize: 11, fontWeight: "700" },
  error: { backgroundColor: "#FFF7ED", borderColor: "#FED7AA", borderWidth: 1, borderRadius: 10, padding: 12 },
  errorText: { color: "#9A3412", fontSize: 12, lineHeight: 18 },
  action: { backgroundColor: "#1877F2", borderRadius: 8, minHeight: 40, justifyContent: "center", alignItems: "center", paddingHorizontal: 14, marginTop: 10 },
  actionText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
});
