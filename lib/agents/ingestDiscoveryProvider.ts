export type IngestDiscoveryProvider =
  | "anthropic_web_search"
  | "rss_seed_only"
  | "rss_seeded_primary";

export function resolveIngestDiscoveryProvider(
  rawProvider: string | undefined
): IngestDiscoveryProvider {
  const normalized = rawProvider?.trim().toLowerCase();
  if (normalized === "rss_seeded_primary") return "rss_seeded_primary";
  if (normalized === "rss_seed_only") return "rss_seed_only";
  return "anthropic_web_search";
}

