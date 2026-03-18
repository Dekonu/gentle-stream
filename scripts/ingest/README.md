# Ingest Script

Standalone CLI tool to populate the Supabase database with articles during development.
In production this is replaced by the Vercel cron jobs in `app/api/cron/`.

## Setup

Requires `tsx` and `dotenv` — install them if not already present:

```bash
npm install --save-dev tsx dotenv
```

## Usage

Run from the **project root** (not from inside `scripts/`):

```bash
# Ingest all categories (6 articles each) then tag them
npx tsx scripts/ingest/run.ts

# Ingest a single category
npx tsx scripts/ingest/run.ts --category "Science & Discovery"

# Ingest all categories with a custom article count
npx tsx scripts/ingest/run.ts --all --count 10

# Only run the tagger on existing untagged articles (no new ingest)
npx tsx scripts/ingest/run.ts --tag-only

# Ingest without running the tagger afterwards
npx tsx scripts/ingest/run.ts --no-tag
```

## How it works

1. Prints current DB stock per category
2. Calls `runIngestAgent` (from `lib/agents/ingestAgent.ts`) — 1 article per API call, token-aware
3. Calls `runTaggerAgent` (from `lib/agents/taggerAgent.ts`) to enrich new articles
4. Prints updated stock report

## Notes

- Reads `.env.local` automatically via `dotenv/config`
- The token budget tracker in `ingestAgent.ts` pauses between requests if the
  30k/min rate limit is close — you'll see log output when this happens
- Once the app is deployed to Vercel, this script is no longer needed;
  `app/api/cron/scheduler/route.ts` handles periodic ingestion automatically
