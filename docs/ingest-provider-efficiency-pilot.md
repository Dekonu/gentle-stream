# Ingest Provider Efficiency Pilot

## Goal
- Reduce ingestion cost while preserving locale relevance and uplifting quality.

## Provider abstraction
- `INGEST_DISCOVERY_PROVIDER=rss_seeded_primary` (rollout default when not explicitly overridden).
- `INGEST_DISCOVERY_PROVIDER=anthropic_web_search` (baseline comparison mode).
- `INGEST_DISCOVERY_PROVIDER=rss_seed_only` (RSS-only control mode, no web-search fallback).
- The ingest agent now routes discovery through a provider resolver (`lib/agents/ingestDiscoveryProvider.ts`).

## Pilot design
- Run a 2-day A/B window:
  - **Day 1 (A)**: Anthropic web-search discovery + batch expansion.
  - **Day 2 (B)**: RSS-seeded primary discovery + Anthropic fallback + batch expansion.
- Keep expansion pipeline, dedup, and policy filters identical across variants.
- Keep locale assignment strategy identical across variants.
- Scheduler provider routing is controlled manually in code:
  - update `MANUAL_DISCOVERY_PROVIDER` in `app/api/cron/scheduler/route.ts`
  - use `"anthropic_web_search"` for Day 1 baseline and `"rss_seeded_primary"` for Day 2.

## RSS health / safety controls
- Per-feed fetch health is tracked in `rss_feeds`:
  - `last_fetched_at`, `last_success_at`, `last_error`, `consecutive_failures`.
- Feeds auto-disable after repeated failures (`RSS_FEED_AUTO_DISABLE_FAILURES`, default 8).
- Discovery pull limits are bounded (`RSS_DISCOVERY_MAX_FEEDS`, `RSS_DISCOVERY_ITEMS_PER_FEED`) to keep cron runtime predictable.

## Success metrics
- Cost per inserted article.
- Insertions per 1k input tokens.
- Duplicate + precheck rejection rate.
- Policy rejection rate (political / solemn / low uplift).
- Locale relevance acceptance (manual spot-check sample).

## Exit criteria
- Promote lower-cost provider only if:
  - cost per inserted article improves by at least 25%,
  - locale relevance acceptance stays within 5% of baseline,
  - policy rejection rate does not regress materially.

