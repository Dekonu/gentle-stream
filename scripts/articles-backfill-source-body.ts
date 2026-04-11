/**
 * Backfill article body text by re-fetching the canonical source URL and merging
 * with the same rules as RSS-native ingest (`chooseRssNarrativeContent`).
 *
 * Default mode is DRY RUN (no updates). Use --apply to write changes.
 *
 * It does **not** detect "description only" directly. It selects rows that look like
 * RSS-native ingest output: `source = ingest`, `content_kind = news`, optional
 * `body ILIKE '%This report is sourced directly from the original RSS item%'` (on by default),
 * and at least one `http(s)` URL in `source_urls`. Short vs long copy is decided later:
 * after fetching the page, `chooseRssNarrativeContent` skips updates when the source
 * text would not improve on the stored first paragraph.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/articles-backfill-source-body.ts dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-backfill-source-body.ts --apply dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-backfill-source-body.ts --apply --max-rows=200 --delay-ms=500 dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-backfill-source-body.ts --id=<uuid> --apply dotenv_config_path=.env.local
 *
 *   --approved-only          filter moderation_status = approved (column must exist).
 *   --require-rss-footer=false   widen selection if bodies lack the exact RSS disclaimer line.
 *   --print-sql              print equivalent SQL and exit (for Supabase SQL editor debugging).
 */

import { db } from "../lib/db/client";
import {
  fetchArticlePlainTextFromUrl,
  resolveHttpUrlForFetch,
} from "../lib/rss/articleContent";
import {
  chooseRssNarrativeContent,
  normalizeRssNarrativeText,
} from "../lib/rss/rssNarrativeMerge";

const RSS_FOOTER_WITH_URL =
  "This report is sourced directly from the original RSS item and preserved without a full AI rewrite.";
const RSS_FOOTER_NO_URL = "This report is sourced directly from the original RSS item.";

interface ArticleRow {
  id: string;
  category: string;
  headline: string;
  subheadline: string;
  body: string;
  source_urls: string[] | null;
}

function parseArg(name: string): string | null {
  const prefix = `--${name}=`;
  const exact = `--${name}`;
  const fromEq = process.argv.find((arg) => arg.startsWith(prefix));
  if (fromEq) return fromEq.slice(prefix.length);
  return process.argv.includes(exact) ? "true" : null;
}

function parseIntArg(name: string, fallback: number): number {
  const raw = parseArg(name);
  if (raw == null) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function trimToLength(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function firstSentence(value: string): string {
  const match = value.match(/^[^.!?]+[.!?]?/);
  return (match?.[0] ?? value).trim();
}

function stripCitations(text: string): string {
  const closeTag = "</cite>";
  let output = text;
  while (true) {
    const lower = output.toLowerCase();
    const start = lower.indexOf("<cite");
    if (start < 0) break;
    const end = output.indexOf(">", start);
    if (end < 0) {
      output = output.slice(0, start);
      break;
    }
    output = output.slice(0, start) + output.slice(end + 1);
  }
  while (true) {
    const lower = output.toLowerCase();
    const idx = lower.indexOf(closeTag);
    if (idx < 0) break;
    output = output.slice(0, idx) + output.slice(idx + closeTag.length);
  }
  return output.trim();
}

function extractFirstParagraph(body: string): { first: string; hasRssFooter: boolean } {
  const withUrlIdx = body.indexOf(`\n\n${RSS_FOOTER_WITH_URL}`);
  if (withUrlIdx >= 0) {
    return { first: body.slice(0, withUrlIdx).trim(), hasRssFooter: true };
  }
  const noUrlIdx = body.indexOf(`\n\n${RSS_FOOTER_NO_URL}`);
  if (noUrlIdx >= 0) {
    return { first: body.slice(0, noUrlIdx).trim(), hasRssFooter: true };
  }
  return { first: body.trim(), hasRssFooter: false };
}

function pickHttpSourceUrl(urls: string[] | null): string | null {
  if (!urls || urls.length === 0) return null;
  for (const raw of urls) {
    const resolved = resolveHttpUrlForFetch(raw);
    if (resolved) return resolved;
  }
  return null;
}

function estimateReadingTime(body: string): number {
  return Math.round((body.split(/\s+/).length / 200) * 60);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** PostgreSQL equivalent of `loadCandidates` (for debugging counts vs the script). */
function buildLoadCandidatesSql(input: {
  maxRows: number;
  category: string | null;
  singleId: string | null;
  requireRssFooter: boolean;
  approvedOnly: boolean;
}): string {
  const whereExtra: string[] = [];
  if (input.singleId) {
    whereExtra.push(`  AND id = '${input.singleId.replace(/'/g, "''")}'::uuid`);
  }
  if (input.category) {
    whereExtra.push(`  AND category = '${input.category.replace(/'/g, "''")}'`);
  }
  if (input.approvedOnly) {
    whereExtra.push("  AND moderation_status = 'approved'");
  }
  if (input.requireRssFooter) {
    whereExtra.push(
      "  AND body ILIKE '%This report is sourced directly from the original RSS item%'"
    );
  }
  /* DB stores normaliseUrl() = host/path OR full https://…; both are fetchable after resolveHttpUrlForFetch */
  const httpUrlClause = `  AND EXISTS (
    SELECT 1
    FROM unnest(coalesce(source_urls, '{}'::text[])) AS u(url)
    WHERE length(trim(url)) > 0
      AND (
        trim(url) ~* '^https?://'
        OR trim(url) ~ '^[a-zA-Z0-9][a-zA-Z0-9.-]*\\.[a-zA-Z]{2,}(/|$)'
      )
  )`;

  const baseWhere = [
    "WHERE source = 'ingest'",
    "  AND content_kind = 'news'",
    "  AND deleted_at IS NULL",
    ...whereExtra,
    httpUrlClause,
  ].join("\n");

  return [
    "-- Mirrors scripts/articles-backfill-source-body.ts candidate query.",
    "-- Requires at least one http(s) URL in source_urls (same idea as pickHttpSourceUrl).",
    "",
    "SELECT",
    "  id,",
    "  category,",
    "  headline,",
    "  fetched_at,",
    "  source_urls,",
    "  left(body, 240) AS body_preview",
    "FROM articles",
    baseWhere,
    `ORDER BY fetched_at DESC`,
    `LIMIT ${input.maxRows};`,
    "",
    "-- Count-only (same filters):",
    "SELECT count(*)::int AS candidate_count",
    "FROM articles",
    baseWhere,
    ";",
  ].join("\n");
}

async function loadCandidates(input: {
  maxRows: number;
  category: string | null;
  singleId: string | null;
  requireRssFooter: boolean;
  approvedOnly: boolean;
}): Promise<ArticleRow[]> {
  function baseQuery() {
    let query = db
      .from("articles")
      .select("id, category, headline, subheadline, body, source_urls")
      .eq("source", "ingest")
      .eq("content_kind", "news")
      .is("deleted_at", null);

    if (input.category) {
      query = query.eq("category", input.category);
    }
    if (input.approvedOnly) {
      query = query.eq("moderation_status", "approved");
    }
    if (input.requireRssFooter) {
      query = query.ilike("body", "%This report is sourced directly from the original RSS item%");
    }
    return query;
  }

  if (input.singleId) {
    const { data, error } = await baseQuery().eq("id", input.singleId).limit(1);
    if (error) throw new Error(`loadCandidates: ${error.message}`);
    const rows = (data ?? []) as ArticleRow[];
    return rows.filter((row) => pickHttpSourceUrl(row.source_urls)).slice(0, input.maxRows);
  }

  const pageSize = 100;
  const out: ArticleRow[] = [];

  for (let offset = 0; offset < input.maxRows; offset += pageSize) {
    const { data, error } = await baseQuery()
      .order("fetched_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) throw new Error(`loadCandidates: ${error.message}`);
    const rows = (data ?? []) as ArticleRow[];
    for (const row of rows) {
      if (pickHttpSourceUrl(row.source_urls)) out.push(row);
      if (out.length >= input.maxRows) return out.slice(0, input.maxRows);
    }
    if (rows.length < pageSize) break;
  }

  return out.slice(0, input.maxRows);
}

async function main() {
  const apply = parseArg("apply") === "true";
  const maxRows = parseIntArg("max-rows", 500);
  const delayMs = parseIntArg("delay-ms", 400);
  const category = parseArg("category");
  const singleId = parseArg("id");
  const requireRssFooter = parseArg("require-rss-footer") !== "false";
  /** Opt-in when `articles.moderation_status` exists. */
  const approvedOnly = parseArg("approved-only") === "true";

  if (parseArg("print-sql") === "true") {
    const sql = buildLoadCandidatesSql({
      maxRows,
      category: category && category.length > 0 ? category : null,
      singleId: singleId && singleId.length > 0 ? singleId : null,
      requireRssFooter,
      approvedOnly,
    });
    console.log(sql);
    return;
  }

  console.log("══════════════════════════════════════════════");
  console.log("  Article source-page body backfill");
  console.log("══════════════════════════════════════════════");
  console.log(`Mode: ${apply ? "APPLY (will update)" : "DRY RUN (no updates)"}`);
  console.log(`Max rows: ${maxRows}  delay-ms: ${delayMs}`);
  console.log(`require-rss-footer: ${requireRssFooter}  approved-only: ${approvedOnly}`);
  if (category) console.log(`Category filter: ${category}`);
  if (singleId) console.log(`Single id: ${singleId}`);

  const rows = await loadCandidates({
    maxRows,
    category: category && category.length > 0 ? category : null,
    singleId: singleId && singleId.length > 0 ? singleId : null,
    requireRssFooter,
    approvedOnly,
  });

  console.log(`\nCandidates (with http source URL): ${rows.length}`);
  if (rows.length === 0) {
    console.log(
      "\nNo rows matched. Common causes:\n" +
        "  • Body does not contain the RSS disclaimer (try --require-rss-footer=false).\n" +
        "  • source is not 'ingest' or content_kind is not 'news'.\n" +
        "  • source_urls is empty or has no http(s) URL.\n" +
        "  • deleted_at is set, or --approved-only excludes everything.\n" +
        "  • --category filter too narrow.\n"
    );
  }

  let examined = 0;
  let skipped = 0;
  let updated = 0;

  for (const row of rows) {
    examined += 1;
    const sourceUrl = pickHttpSourceUrl(row.source_urls);
    if (!sourceUrl) {
      skipped += 1;
      console.log(`[skip ${row.id}] no http(s) source_urls`);
      continue;
    }

    const { first: existingFirst, hasRssFooter } = extractFirstParagraph(row.body);
    if (requireRssFooter && !hasRssFooter) {
      skipped += 1;
      console.log(`[skip ${row.id}] expected RSS footer not found`);
      continue;
    }

    const bodyFromFeed = normalizeRssNarrativeText(existingFirst);
    const summary = normalizeRssNarrativeText(row.subheadline?.trim() ?? "");

    const rawHtmlText = await fetchArticlePlainTextFromUrl(sourceUrl);
    const bodyFromSource = normalizeRssNarrativeText(rawHtmlText?.trim() ?? "");

    const newContent = chooseRssNarrativeContent({
      summary,
      bodyFromFeed,
      bodyFromSource,
    });

    if (newContent === bodyFromFeed) {
      skipped += 1;
      console.log(
        `[skip ${row.id}] ${row.headline.slice(0, 56)}… — no better text from source (same as RSS excerpt)`
      );
      if (examined < rows.length) await sleep(delayMs);
      continue;
    }

    const paragraphOne = newContent;
    const paragraphTwo = sourceUrl.trim().length > 0 ? RSS_FOOTER_WITH_URL : RSS_FOOTER_NO_URL;
    const newBody = stripCitations(`${paragraphOne}\n\n${paragraphTwo}`);
    const pullQuote = stripCitations(
      trimToLength(firstSentence(summary || newContent), 240)
    );
    const readingTimeSecs = estimateReadingTime(newBody);

    console.log(
      `[${apply ? "apply" : "dry"} ${row.id}] ${row.headline.slice(0, 64)}…  ` +
        `body ${bodyFromFeed.length}→${paragraphOne.length} chars`
    );

    if (!apply) {
      if (examined < rows.length) await sleep(delayMs);
      continue;
    }

    const { error } = await db
      .from("articles")
      .update({
        body: newBody,
        pull_quote: pullQuote,
        reading_time_secs: readingTimeSecs,
      })
      .eq("id", row.id);

    if (error) {
      console.error(`[error ${row.id}] ${error.message}`);
    } else {
      updated += 1;
    }

    if (examined < rows.length) await sleep(delayMs);
  }

  console.log(`\nExamined: ${examined}  Updated: ${updated}  Skipped: ${skipped}`);
  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to write updates.");
  }
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
