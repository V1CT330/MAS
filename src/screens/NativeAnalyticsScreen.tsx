import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { supabase } from "../lib/supabase";

type RangeKey = "7d" | "30d" | "90d" | "custom";
type EventRow = { created_at: string; device: string | null; country: string | null; listing_id: string };
type Listing = { id: string; name: string; kind: string; category: string | null; status: string; downloads: number | null; rating_avg: number | null; rating_count: number | null };
type Subscription = { plan: string | null; status: string | null; current_period_end: string | null } | null;
type Bounds = { start: Date; end: Date; previousStart: Date; previousEnd: Date; duration: number };
type TrendRow = { key: string; label: string; installs: number; views: number };

const DAY = 24 * 60 * 60 * 1000;
const EMPTY_EVENTS = { installs: [] as EventRow[], views: [] as EventRow[] };

function hasProAccess(value: Subscription) {
  if (!value || value.plan !== "pro" || (value.status !== "active" && value.status !== "cancelled" && value.status !== "trialing")) return false;
  const end = value.current_period_end ? Date.parse(value.current_period_end) : NaN;
  return Number.isFinite(end) && end > Date.now();
}

function isoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function rangeFor(key: RangeKey, customStart: string, customEnd: string): Bounds {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  let start = new Date(end);
  if (key === "7d") start = new Date(end.getTime() - 6 * DAY);
  else if (key === "30d") start = new Date(end.getTime() - 29 * DAY);
  else if (key === "90d") start = new Date(end.getTime() - 89 * DAY);
  else {
    const parsedStart = customStart ? new Date(customStart + "T00:00:00") : new Date(end.getTime() - 29 * DAY);
    const parsedEnd = customEnd ? new Date(customEnd + "T23:59:59.999") : end;
    if (Number.isFinite(parsedStart.getTime())) start = parsedStart;
    if (Number.isFinite(parsedEnd.getTime())) end.setTime(parsedEnd.getTime());
  }
  if (start > end) start.setTime(end.getTime() - 29 * DAY);
  const duration = Math.min(365, Math.max(1, Math.floor((end.getTime() - start.getTime()) / DAY) + 1));
  start.setTime(end.getTime() - (duration - 1) * DAY);
  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(previousEnd.getTime() - duration * DAY + 1);
  return { start, end, previousStart, previousEnd, duration };
}

function customDateError(start: string, end: string) {
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(start) || !datePattern.test(end)) return "Enter both dates in YYYY-MM-DD format.";
  const parsedStart = new Date(start + "T00:00:00");
  const parsedEnd = new Date(end + "T00:00:00");
  if (!Number.isFinite(parsedStart.getTime()) || !Number.isFinite(parsedEnd.getTime()) || isoDate(parsedStart) !== start || isoDate(parsedEnd) !== end) {
    return "One of the selected dates is invalid.";
  }
  if (start > end) return "The start date must not be after the end date.";
  if (end > isoDate(new Date())) return "The end date cannot be in the future.";
  const days = Math.floor((parsedEnd.getTime() - parsedStart.getTime()) / DAY) + 1;
  if (days > 365) return "Choose a reporting period of 365 days or less.";
  return "";
}

async function fetchEvents(table: "install_events" | "view_events", listingIds: string[], startIso: string, endIso: string): Promise<EventRow[]> {
  const pageSize = 1000;
  const rows: EventRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const result = table === "install_events"
      ? await supabase.from("install_events").select("created_at,device,country,listing_id").in("listing_id", listingIds).gte("created_at", startIso).lte("created_at", endIso).order("created_at", { ascending: true }).range(offset, offset + pageSize - 1)
      : await supabase.from("view_events").select("created_at,device,country,listing_id").in("listing_id", listingIds).gte("created_at", startIso).lte("created_at", endIso).order("created_at", { ascending: true }).range(offset, offset + pageSize - 1);
    if (result.error) throw result.error;
    const page = (result.data ?? []) as EventRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

function within(row: EventRow, start: Date, end: Date) {
  const time = Date.parse(row.created_at);
  return Number.isFinite(time) && time >= start.getTime() && time <= end.getTime();
}

function tally(rows: EventRow[], key: "device" | "country") {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = row[key]?.trim() || "Unknown";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
}

function makeTrend(installs: EventRow[], views: EventRow[], start: Date, end: Date, duration: number): TrendRow[] {
  const daily = duration <= 90;
  const count = daily ? duration : Math.min(12, Math.ceil(duration / 30));
  const formatter = new Intl.DateTimeFormat("en", daily ? { month: "short", day: "numeric" } : { month: "short", year: "2-digit" });
  const rows: TrendRow[] = [];
  for (let index = 0; index < count; index += 1) {
    const from = new Date(start);
    const to = new Date(start);
    if (daily) {
      from.setDate(start.getDate() + index);
      to.setTime(from.getTime() + DAY - 1);
    } else {
      from.setMonth(start.getMonth() + index);
      to.setMonth(start.getMonth() + index + 1, 0);
      to.setHours(23, 59, 59, 999);
    }
    if (from > end) break;
    const bucketEnd = to > end ? end : to;
    rows.push({
      key: from.toISOString(),
      label: formatter.format(from),
      installs: installs.filter((row) => within(row, from, bucketEnd)).length,
      views: views.filter((row) => within(row, from, bucketEnd)).length,
    });
  }
  return rows;
}

const number = (value: number) => new Intl.NumberFormat("en").format(value);

export default function NativeAnalyticsScreen({ onBack }: { onBack: () => void }) {
  const [range, setRange] = useState<RangeKey>("30d");
  const initialEnd = isoDate(new Date());
  const initialStart = isoDate(new Date(Date.now() - 29 * DAY));
  const [customStart, setCustomStart] = useState(initialStart);
  const [customEnd, setCustomEnd] = useState(initialEnd);
  const [appliedStart, setAppliedStart] = useState(initialStart);
  const [appliedEnd, setAppliedEnd] = useState(initialEnd);
  const [productSearch, setProductSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState("all");
  const [subscription, setSubscription] = useState<Subscription>(null);
  const [events, setEvents] = useState(EMPTY_EVENTS);
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const bounds = useMemo(() => rangeFor(range, appliedStart, appliedEnd), [range, appliedStart, appliedEnd]);
  const dateError = range === "custom" ? customDateError(customStart, customEnd) : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!auth.user) throw new Error("Sign in to view developer analytics.");
      const id = auth.user.id;
      const [subResult, listingResult] = await Promise.all([
        supabase.from("subscriptions").select("plan,status,current_period_end").eq("user_id", id).maybeSingle(),
        supabase.from("listings").select("id,name,kind,category,status,downloads,rating_avg,rating_count").eq("developer_id", id).order("updated_at", { ascending: false }),
      ]);
      if (subResult.error) throw subResult.error;
      if (listingResult.error) throw listingResult.error;
      const sub = (subResult.data ?? null) as Subscription;
      const products = (listingResult.data ?? []) as Listing[];
      setSubscription(sub);
      setListings(products);
      if (!hasProAccess(sub) || products.length === 0) {
        setEvents(EMPTY_EVENTS);
        return;
      }
      const ids = products.map((item) => item.id);
      const startIso = bounds.previousStart.toISOString();
      const endIso = bounds.end.toISOString();
      const [installs, views] = await Promise.all([
        fetchEvents("install_events", ids, startIso, endIso),
        fetchEvents("view_events", ids, startIso, endIso),
      ]);
      setEvents({ installs, views });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load analytics.");
      setEvents(EMPTY_EVENTS);
    } finally {
      setLoading(false);
    }
  }, [bounds]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (selectedProduct !== "all" && !listings.some((item) => item.id === selectedProduct)) setSelectedProduct("all");
  }, [listings, selectedProduct]);

  const selectedIds = useMemo(() => selectedProduct === "all" ? new Set(listings.map((item) => item.id)) : new Set([selectedProduct]), [listings, selectedProduct]);
  const currentInstalls = useMemo(() => events.installs.filter((row) => selectedIds.has(row.listing_id) && within(row, bounds.start, bounds.end)), [events, selectedIds, bounds]);
  const currentViews = useMemo(() => events.views.filter((row) => selectedIds.has(row.listing_id) && within(row, bounds.start, bounds.end)), [events, selectedIds, bounds]);
  const previousInstalls = useMemo(() => events.installs.filter((row) => selectedIds.has(row.listing_id) && within(row, bounds.previousStart, bounds.previousEnd)), [events, selectedIds, bounds]);
  const previousViews = useMemo(() => events.views.filter((row) => selectedIds.has(row.listing_id) && within(row, bounds.previousStart, bounds.previousEnd)), [events, selectedIds, bounds]);

  const selectedListings = listings.filter((item) => selectedIds.has(item.id));
  const appIds = new Set(listings.filter((item) => item.kind !== "website").map((item) => item.id));
  const websiteIds = new Set(listings.filter((item) => item.kind === "website").map((item) => item.id));
  const appInstalls = currentInstalls.filter((row) => appIds.has(row.listing_id));
  const websiteVisits = currentInstalls.filter((row) => websiteIds.has(row.listing_id));
  const appViews = currentViews.filter((row) => appIds.has(row.listing_id));
  const previousAppInstalls = previousInstalls.filter((row) => appIds.has(row.listing_id));
  const previousAppViews = previousViews.filter((row) => appIds.has(row.listing_id));
  const conversion = appViews.length ? appInstalls.length / appViews.length * 100 : 0;
  const previousConversion = previousAppViews.length ? previousAppInstalls.length / previousAppViews.length * 100 : 0;
  const ratingCount = selectedListings.reduce((sum, item) => sum + Number(item.rating_count ?? 0), 0);
  const weightedRating = selectedListings.reduce((sum, item) => sum + Number(item.rating_avg ?? 0) * Number(item.rating_count ?? 0), 0);
  const averageRating = ratingCount ? weightedRating / ratingCount : 0;
  const trend = useMemo(() => makeTrend(currentInstalls, currentViews, bounds.start, bounds.end, bounds.duration), [currentInstalls, currentViews, bounds]);
  const deviceData = tally([...currentInstalls, ...currentViews], "device").slice(0, 6);
  const countryData = tally([...currentInstalls, ...currentViews], "country").slice(0, 6);
  const productRows = selectedListings.map((item) => {
    const views = currentViews.filter((row) => row.listing_id === item.id).length;
    const installs = currentInstalls.filter((row) => row.listing_id === item.id).length;
    return { item, views, installs, conversion: views ? installs / views * 100 : 0 };
  }).sort((a, b) => b.installs - a.installs);
  const filteredProducts = listings.filter((item) => item.name.toLowerCase().includes(productSearch.trim().toLowerCase()));
  const maxValue = Math.max(1, ...trend.map((row) => Math.max(row.views, row.installs)));
  const pro = hasProAccess(subscription);
  const published = listings.filter((item) => item.status === "published").length;
  const periodLabel = isoDate(bounds.start) + " to " + isoDate(bounds.end);

  const applyCustomRange = () => {
    if (dateError) {
      setError(dateError);
      return;
    }
    setError("");
    setAppliedStart(customStart);
    setAppliedEnd(customEnd);
  };

  return <ScrollView style={styles.root} contentContainerStyle={styles.content}>
    <TouchableOpacity onPress={onBack} style={styles.back}><Text style={styles.backText}>‹  Developer dashboard</Text></TouchableOpacity>
    <Text style={styles.kicker}>DEVELOPER MODE</Text>
    <Text style={styles.heading}>Analytics</Text>
    <Text style={styles.subtitle}>Product performance from your MAS developer account.</Text>
    {loading ? <ActivityIndicator color="#1A73E8" style={{ marginTop: 28 }} /> : null}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {!loading && !error && !pro ? <View style={styles.proSection}>
      <Text style={styles.proTag}>DEVELOPER PRO</Text>
      <Text style={styles.sectionTitle}>Advanced analytics is a Pro feature</Text>
      <Text style={styles.subtitle}>Upgrade to view performance trends, audience breakdowns and product comparisons. Access is based on your confirmed Pro entitlement, including an active trial or paid period.</Text>
      <TouchableOpacity onPress={() => void Linking.openURL("https://malawian-app-store.vercel.app/console/subscription")} style={styles.primary}><Text style={styles.primaryText}>View Developer Pro</Text></TouchableOpacity>
    </View> : null}
    {!loading && !error && pro ? <>
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>REPORTING PERIOD</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ranges}>
          {(["7d", "30d", "90d", "custom"] as RangeKey[]).map((item) => <TouchableOpacity key={item} onPress={() => { setRange(item); setError(""); }} style={[styles.range, range === item && styles.rangeActive]}><Text style={[styles.rangeText, range === item && styles.rangeTextActive]}>{item === "custom" ? "Custom" : item.toUpperCase()}</Text></TouchableOpacity>)}
        </ScrollView>
        {range === "custom" ? <View style={styles.dateRow}>
          <View style={styles.dateField}><Text style={styles.inputLabel}>From</Text><TextInput value={customStart} onChangeText={setCustomStart} placeholder="YYYY-MM-DD" maxLength={10} autoCapitalize="none" keyboardType="numbers-and-punctuation" style={styles.dateInput} accessibilityLabel="Analytics start date" /></View>
          <View style={styles.dateField}><Text style={styles.inputLabel}>To</Text><TextInput value={customEnd} onChangeText={setCustomEnd} placeholder="YYYY-MM-DD" maxLength={10} autoCapitalize="none" keyboardType="numbers-and-punctuation" style={styles.dateInput} accessibilityLabel="Analytics end date" /></View>
          <TouchableOpacity onPress={applyCustomRange} disabled={Boolean(dateError)} style={[styles.applyButton, Boolean(dateError) && styles.disabled]}><Text style={styles.applyText}>Apply</Text></TouchableOpacity>
        </View> : null}
        {range === "custom" && dateError ? <Text style={styles.inlineError}>{dateError}</Text> : null}
        <Text style={styles.periodText}>{periodLabel} · Compared with the preceding {bounds.duration}-day period</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionLabel}>PRODUCT FILTER</Text>
        <TextInput value={productSearch} onChangeText={setProductSearch} placeholder="Search your products" autoCapitalize="none" style={styles.searchInput} accessibilityLabel="Search analytics products" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.productFilters}>
          <TouchableOpacity onPress={() => setSelectedProduct("all")} style={[styles.productFilter, selectedProduct === "all" && styles.productFilterActive]}><Text style={[styles.productFilterText, selectedProduct === "all" && styles.productFilterTextActive]}>All products</Text></TouchableOpacity>
          {filteredProducts.map((item) => <TouchableOpacity key={item.id} onPress={() => setSelectedProduct(item.id)} style={[styles.productFilter, selectedProduct === item.id && styles.productFilterActive]}><Text numberOfLines={1} style={[styles.productFilterText, selectedProduct === item.id && styles.productFilterTextActive]}>{item.name}</Text></TouchableOpacity>)}
        </ScrollView>
        {filteredProducts.length === 0 ? <Text style={styles.empty}>No products match that search.</Text> : null}
      </View>

      <View style={styles.metrics}>
        <View style={styles.metric}><Text style={styles.metricValue}>{number(appInstalls.length)}</Text><Text style={styles.metricLabel}>App installs</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{number(appViews.length)}</Text><Text style={styles.metricLabel}>Product views</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{appViews.length ? conversion.toFixed(1) + "%" : "—"}</Text><Text style={styles.metricLabel}>View to install · {previousConversion ? previousConversion.toFixed(1) + "% previous" : "no baseline"}</Text></View>
        <View style={styles.metric}><Text style={styles.metricValue}>{ratingCount ? averageRating.toFixed(2) : "—"}</Text><Text style={styles.metricLabel}>Average rating · {number(ratingCount)} reviews</Text></View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Performance over time</Text>
        <Text style={styles.subtitle}>Daily activity up to 90 days; longer periods are grouped by month.</Text>
        {trend.length ? trend.map((row) => <View key={row.key} style={styles.chartRow}>
          <Text style={styles.dateLabel}>{row.label}</Text>
          <View style={styles.bars}>
            <View style={styles.barTrack}><View style={[styles.bar, styles.viewsBar, { width: (String(row.views ? Math.max(2, row.views / maxValue * 100) : 0) + "%") as any }]} /></View>
            <View style={styles.barTrack}><View style={[styles.bar, styles.installBar, { width: (String(row.installs ? Math.max(2, row.installs / maxValue * 100) : 0) + "%") as any }]} /></View>
          </View>
          <Text style={styles.values}>{number(row.views)}/{number(row.installs)}</Text>
        </View>) : <Text style={styles.empty}>No recorded events for this period.</Text>}
        <View style={styles.legend}><Text style={styles.legendViews}>■ Views</Text><Text style={styles.legendInstalls}>■ Installs / visits</Text></View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Audience breakdown</Text>
        <Text style={styles.subtitle}>Combined tracked views and install events, not unique people.</Text>
        <View style={styles.audienceRow}>
          <View style={styles.audienceColumn}>
            <Text style={styles.sectionLabel}>DEVICES</Text>
            {deviceData.length ? deviceData.map((item) => <View key={item.name} style={styles.breakdownRow}><Text numberOfLines={1} style={styles.breakdownName}>{item.name}</Text><Text style={styles.breakdownValue}>{number(item.value)}</Text></View>) : <Text style={styles.empty}>No device data yet.</Text>}
          </View>
          <View style={styles.audienceColumn}>
            <Text style={styles.sectionLabel}>COUNTRIES</Text>
            {countryData.length ? countryData.map((item) => <View key={item.name} style={styles.breakdownRow}><Text numberOfLines={1} style={styles.breakdownName}>{item.name}</Text><Text style={styles.breakdownValue}>{number(item.value)}</Text></View>) : <Text style={styles.empty}>No country data yet.</Text>}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Product performance</Text>
        <Text style={styles.subtitle}>{number(listings.length)} total products · {number(published)} published · {number(websiteVisits.length)} website visits in period</Text>
        {productRows.length ? productRows.map(({ item, views, installs, conversion: rate }) => <View key={item.id} style={styles.productRow}>
          <View style={styles.productCopy}><Text numberOfLines={1} style={styles.productName}>{item.name}</Text><Text style={styles.productMeta}>{item.kind} · {item.category || "Uncategorised"} · {item.status}</Text></View>
          <View style={styles.productStat}><Text style={styles.productValue}>{number(views)}</Text><Text style={styles.productMeta}>Views</Text></View>
          <View style={styles.productStat}><Text style={styles.productValue}>{number(installs)}</Text><Text style={styles.productMeta}>Installs</Text></View>
          <View style={styles.productStat}><Text style={styles.productValue}>{views ? rate.toFixed(1) + "%" : "—"}</Text><Text style={styles.productMeta}>Conversion</Text></View>
          <View style={styles.productStat}><Text style={styles.productValue}>{number(Number(item.downloads ?? 0))}</Text><Text style={styles.productMeta}>Lifetime</Text></View>
          <View style={styles.productStat}><Text style={styles.productValue}>{item.rating_count ? Number(item.rating_avg ?? 0).toFixed(1) : "—"}</Text><Text style={styles.productMeta}>Rating</Text></View>
        </View>) : <Text style={styles.empty}>Publish products to see performance comparisons.</Text>}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Tracking health</Text>
        <Text style={styles.subtitle}>{currentInstalls.length + currentViews.length ? "Event tracking is recording activity for this period." : "No install or view events were recorded for this period. This may mean low traffic or missing instrumentation."}</Text>
        <Text style={styles.footnote}>Only recorded events are included. Unique users, retention, revenue, search attribution and crash rates are not estimated.</Text>
      </View>
    </> : null}
    <TouchableOpacity onPress={() => void load()} style={styles.refresh}><Text style={styles.refreshText}>Refresh analytics</Text></TouchableOpacity>
  </ScrollView>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F8F9FA" },
  content: { padding: 16, paddingBottom: 36 },
  back: { alignSelf: "flex-start", paddingVertical: 8, paddingRight: 12 },
  backText: { color: "#1A73E8", fontSize: 13, fontWeight: "600" },
  kicker: { color: "#1A73E8", fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 12 },
  heading: { color: "#202124", fontSize: 25, fontWeight: "700", marginTop: 4 },
  subtitle: { color: "#5F6368", fontSize: 12, lineHeight: 18, marginTop: 5 },
  error: { color: "#B3261E", backgroundColor: "#FCE8E6", padding: 12, marginTop: 14, fontSize: 12 },
  inlineError: { color: "#B3261E", fontSize: 11, marginTop: 8 },
  section: { marginTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: "#E8EAED" },
  proSection: { marginTop: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#E8EAED" },
  proTag: { color: "#1A73E8", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  sectionTitle: { color: "#202124", fontSize: 16, fontWeight: "700" },
  sectionLabel: { color: "#5F6368", fontSize: 10, fontWeight: "800", letterSpacing: 0.8, marginBottom: 8 },
  ranges: { flexDirection: "row", gap: 8, paddingRight: 8 },
  range: { paddingVertical: 8, paddingHorizontal: 13, backgroundColor: "#FFF", borderWidth: 1, borderColor: "#DADCE0" },
  rangeActive: { backgroundColor: "#E8F0FE", borderColor: "#AECBFA" },
  rangeText: { color: "#5F6368", fontSize: 11, fontWeight: "600" },
  rangeTextActive: { color: "#174EA6" },
  dateRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, marginTop: 12 },
  dateField: { flex: 1, minWidth: 0 },
  inputLabel: { color: "#5F6368", fontSize: 10, marginBottom: 5 },
  dateInput: { height: 40, borderWidth: 1, borderColor: "#DADCE0", backgroundColor: "#FFF", paddingHorizontal: 8, color: "#202124", fontSize: 11 },
  applyButton: { height: 40, paddingHorizontal: 12, alignItems: "center", justifyContent: "center", backgroundColor: "#1A73E8" },
  applyText: { color: "#FFF", fontSize: 11, fontWeight: "700" },
  disabled: { opacity: 0.45 },
  periodText: { color: "#5F6368", fontSize: 10, marginTop: 10 },
  searchInput: { height: 42, borderWidth: 1, borderColor: "#DADCE0", backgroundColor: "#FFF", paddingHorizontal: 12, color: "#202124", fontSize: 12 },
  productFilters: { flexDirection: "row", gap: 7, paddingTop: 10, paddingRight: 8 },
  productFilter: { maxWidth: 180, paddingVertical: 8, paddingHorizontal: 11, borderWidth: 1, borderColor: "#DADCE0", backgroundColor: "#FFF" },
  productFilterActive: { backgroundColor: "#E8F0FE", borderColor: "#AECBFA" },
  productFilterText: { color: "#5F6368", fontSize: 11, fontWeight: "600" },
  productFilterTextActive: { color: "#174EA6" },
  metrics: { flexDirection: "row", flexWrap: "wrap", marginTop: 14, borderBottomWidth: 1, borderBottomColor: "#E8EAED" },
  metric: { width: "50%", paddingVertical: 12, paddingRight: 10, borderTopWidth: 1, borderTopColor: "#E8EAED" },
  metricValue: { color: "#202124", fontSize: 21, fontWeight: "700" },
  metricLabel: { color: "#5F6368", fontSize: 10, marginTop: 5 },
  chartRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 11 },
  dateLabel: { width: 54, color: "#5F6368", fontSize: 9 },
  bars: { flex: 1, gap: 4 },
  barTrack: { height: 7, backgroundColor: "#E8EAED", overflow: "hidden" },
  bar: { height: 7 },
  viewsBar: { backgroundColor: "#1A73E8" },
  installBar: { backgroundColor: "#188038" },
  values: { width: 58, color: "#5F6368", fontSize: 9, textAlign: "right" },
  legend: { flexDirection: "row", gap: 16, marginTop: 14 },
  legendViews: { color: "#1A73E8", fontSize: 10 },
  legendInstalls: { color: "#188038", fontSize: 10 },
  audienceRow: { flexDirection: "row", gap: 16, marginTop: 14 },
  audienceColumn: { flex: 1, minWidth: 0 },
  breakdownRow: { flexDirection: "row", justifyContent: "space-between", gap: 8, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: "#E8EAED" },
  breakdownName: { flex: 1, color: "#5F6368", fontSize: 11 },
  breakdownValue: { color: "#202124", fontSize: 11, fontWeight: "700" },
  productRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#E8EAED" },
  productCopy: { flex: 1, minWidth: 0 },
  productName: { color: "#202124", fontSize: 12, fontWeight: "600" },
  productMeta: { color: "#80868B", fontSize: 9, marginTop: 3, textTransform: "capitalize" },
  productStat: { minWidth: 38, alignItems: "flex-end" },
  productValue: { color: "#202124", fontSize: 11, fontWeight: "700" },
  empty: { color: "#80868B", fontSize: 11, paddingVertical: 12 },
  footnote: { color: "#80868B", fontSize: 10, lineHeight: 16, marginTop: 9 },
  primary: { minHeight: 44, backgroundColor: "#1A73E8", alignItems: "center", justifyContent: "center", marginTop: 16, paddingHorizontal: 16 },
  primaryText: { color: "#FFF", fontSize: 12, fontWeight: "700" },
  refresh: { alignItems: "center", padding: 14, marginTop: 6 },
  refreshText: { color: "#1A73E8", fontSize: 12, fontWeight: "700" },
});
