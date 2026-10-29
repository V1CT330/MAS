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
