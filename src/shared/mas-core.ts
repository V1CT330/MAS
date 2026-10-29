/**
 * Shared MAS business rules.
 *
 * Keep this file byte-for-byte equivalent in:
 * - V1CT330/malawian-app-store/src/shared/mas-core.ts
 * - V1CT330/MAS/src/shared/mas-core.ts
 *
 * Only platform-neutral TypeScript belongs here. Do not import React, browser APIs,
 * React Native, or Supabase from this module.
 */
export const CATEGORIES = [
  "Business",
  "Education",
  "Entertainment",
  "Finance",
  "Health",
  "News",
  "Shopping",
  "Social",
  "Tools",
  "Transport",
  "Other",
] as const;

export const SUBSCRIPTION_PRICE_MWK = 5000;

export type ListingKind = "app" | "website";
export type ListingStatus = "draft" | "pending" | "published" | "rejected";

export type Listing = {
  id: string;
  developer_id: string;
  slug: string;
  name: string;
  tagline: string | null;
  description: string | null;
  category: string;
  kind: ListingKind;
  icon_url: string | null;
  screenshots: string[];
  website_url: string | null;
  price_mwk: number;
  monetization?: string;
  price_month_mwk?: number;
  price_year_mwk?: number;
  allow_donations?: boolean;
  crypto_address?: string | null;
  sponsored?: boolean;
  status: ListingStatus;
  featured?: boolean;
  rejection_reason?: string | null;
  downloads: number;
  rating_avg: number;
  rating_count: number;
  created_at: string;
  updated_at: string;
};

export function normalizeSearch(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase();
}

export function matchesSearch(values: readonly (string | null | undefined)[], query: string): boolean {
  const normalizedQuery = normalizeSearch(query);
  return !normalizedQuery || values.some((value) => normalizeSearch(value).includes(normalizedQuery));
}

export function matchesListingFilters<T extends { category?: string | null; kind?: string | null }>(
  listing: T,
  filters: { category?: string; kind?: "all" | ListingKind },
): boolean {
  const categoryMatches = !filters.category || filters.category === "All" || listing.category === filters.category;
  const kindMatches = !filters.kind || filters.kind === "all" || (listing.kind || "app") === filters.kind;
  return categoryMatches && kindMatches;
}

export function topByNumber<T>(
  items: readonly T[],
  value: (item: T) => number | null | undefined,
  limit = 8,
): T[] {
  return [...items].sort((a, b) => (value(b) ?? 0) - (value(a) ?? 0)).slice(0, limit);
}

export function topByDate<T>(
  items: readonly T[],
  value: (item: T) => string | null | undefined,
  limit = 8,
): T[] {
  return [...items].sort((a, b) => (value(b) ?? "").localeCompare(value(a) ?? "")).slice(0, limit);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "listing";
}

export function formatMwk(amount: number): string {
  return amount === 0 ? "Free" : `MK${amount.toLocaleString("en-MW")}`;
}

export function formatAmount(amount: number): string {
  return `MK${Math.round(amount).toLocaleString("en-MW")}`;
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes) return "N/A";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export type AsoListing = {
  name?: string | null;
  tagline?: string | null;
  description?: string | null;
  icon_url?: string | null;
  screenshots?: readonly string[] | null;
  banner_url?: string | null;
  tags?: readonly string[] | null;
  rating_avg?: number | null;
  downloads?: number | null;
};

/** Canonical store-optimisation scoring shared by the WebApp and native APK. */
export function asoReport(l: Partial<AsoListing>) {
  const checks = [
    { label: "Name between 3 and 30 characters", ok: (l.name?.length ?? 0) >= 3 && (l.name?.length ?? 0) <= 30, weight: 10 },
    { label: "Tagline written (40+ characters)", ok: (l.tagline?.length ?? 0) >= 40, weight: 10 },
    { label: "Description of 200+ characters", ok: (l.description?.length ?? 0) >= 200, weight: 20 },
    { label: "Icon uploaded", ok: Boolean(l.icon_url), weight: 15 },
    { label: "At least 3 screenshots", ok: (l.screenshots?.length ?? 0) >= 3, weight: 15 },
    { label: "Feature banner uploaded", ok: Boolean(l.banner_url), weight: 5 },
    { label: "3 or more tags", ok: (l.tags?.length ?? 0) >= 3, weight: 10 },
  ];
  const score = checks.reduce((sum, check) => sum + (check.ok ? check.weight : 0), 0);
  return { score, checks, missing: checks.filter((check) => !check.ok).map((check) => check.label) };
}

export function visibilityScore(l: Partial<AsoListing>, reputation: number) {
  const aso = asoReport(l).score;
  const rating = (l.rating_avg ?? 0) * 8;
  const traction = Math.min(20, Math.round((l.downloads ?? 0) / 5));
  return Math.min(100, Math.round(aso * 0.5 + rating + traction + reputation * 0.2));
}

export function reputationTier(score: number) {
  if (score >= 80) return "Elite";
  if (score >= 60) return "Trusted";
  if (score >= 35) return "Rising";
  return "New";
}

