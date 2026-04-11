/**
 * Normalize already-ingested article bodies to remove UI chrome fragments
 * (e.g. caption toggles, short credit lines) using the same paragraph filter
 * used by source-page extraction.
 *
 * Default mode is DRY RUN (no updates). Use --apply to write changes.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/articles-normalize-ingest-body.ts dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-normalize-ingest-body.ts --apply --max-rows=200 dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-normalize-ingest-body.ts --contains="toggle caption" --apply dotenv_config_path=.env.local
 */

import { db } from "../lib/db/client";
import { normalizeArticleNarrative } from "../lib/rss/articleContent";

const RSS_FOOTER_WITH_URL =
  "This report is sourced directly from the original RSS item and preserved without a full AI rewrite.";
const RSS_FOOTER_NO_URL = "This report is sourced directly from the original RSS item.";

interface ArticleRow {
  id: string;
  headline: string;
  subheadline: string | null;
  body: string;
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

function extractFirstParagraph(body: string): { first: string; footer: string | null } {
  const withUrlIdx = body.indexOf(`\n\n${RSS_FOOTER_WITH_URL}`);
  if (withUrlIdx >= 0) {
    return { first: body.slice(0, withUrlIdx).trim(), footer: RSS_FOOTER_WITH_URL };
  }
  const noUrlIdx = body.indexOf(`\n\n${RSS_FOOTER_NO_URL}`);
  if (noUrlIdx >= 0) {
    return { first: body.slice(0, noUrlIdx).trim(), footer: RSS_FOOTER_NO_URL };
  }
  return { first: body.trim(), footer: null };
}

function estimateReadingTime(body: string): number {
  return Math.round((body.split(/\s+/).length / 200) * 60);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadCandidates(input: {
  maxRows: number;
  category: string | null;
  singleId: string | null;
  contains: string | null;
}): Promise<ArticleRow[]> {
  let query = db
    .from("articles")
    .select("id, headline, subheadline, body")
    .eq("source", "ingest")
    .eq("content_kind", "news")
    .is("deleted_at", null);

  if (input.category) query = query.eq("category", input.category);
  if (input.singleId) query = query.eq("id", input.singleId);
  if (input.contains) query = query.ilike("body", `%${input.contains}%`);

  const { data, error } = await query.order("fetched_at", { ascending: false }).limit(input.maxRows);
  if (error) throw new Error(`loadCandidates: ${error.message}`);
  return ((data ?? []) as ArticleRow[]).filter((row) => (row.body ?? "").trim().length > 0);
}

async function main() {
  const apply = parseArg("apply") === "true";
  const maxRows = parseIntArg("max-rows", 300);
  const delayMs = parseIntArg("delay-ms", 250);
  const category = parseArg("category");
  const singleId = parseArg("id");
  const contains = parseArg("contains");

  console.log("══════════════════════════════════════════════");
  console.log("  Ingest body normalization backfill");
  console.log("══════════════════════════════════════════════");
  console.log(`Mode: ${apply ? "APPLY (will update)" : "DRY RUN (no updates)"}`);
  console.log(`Max rows: ${maxRows}  delay-ms: ${delayMs}`);
  if (category) console.log(`Category filter: ${category}`);
  if (singleId) console.log(`Single id: ${singleId}`);
  if (contains) console.log(`Body contains: ${contains}`);

  const rows = await loadCandidates({
    maxRows,
    category: category && category.length > 0 ? category : null,
    singleId: singleId && singleId.length > 0 ? singleId : null,
    contains: contains && contains.length > 0 ? contains : null,
  });

  console.log(`\nCandidates: ${rows.length}`);
  if (rows.length === 0) return;

  let examined = 0;
  let skipped = 0;
  let updated = 0;

  for (const row of rows) {
    examined += 1;
    const { first: existingFirst, footer } = extractFirstParagraph(row.body);
    const normalizedFirst = normalizeArticleNarrative(existingFirst);

    if (!normalizedFirst || normalizedFirst === existingFirst) {
      skipped += 1;
      if (examined < rows.length) await sleep(delayMs);
      continue;
    }

    const body = footer ? `${normalizedFirst}\n\n${footer}` : normalizedFirst;
    const newBody = stripCitations(body);
    const pullQuote = stripCitations(
      trimToLength(firstSentence((row.subheadline ?? "").trim() || normalizedFirst), 240)
    );
    const readingTimeSecs = estimateReadingTime(newBody);

    console.log(
      `[${apply ? "apply" : "dry"} ${row.id}] ${row.headline.slice(0, 64)}…  ` +
        `body ${existingFirst.length}→${normalizedFirst.length} chars`
    );

    if (apply) {
      const { error } = await db
        .from("articles")
        .update({
          body: newBody,
          pull_quote: pullQuote,
          reading_time_secs: readingTimeSecs,
        })
        .eq("id", row.id);

      if (error) console.error(`[error ${row.id}] ${error.message}`);
      else updated += 1;
    }

    if (examined < rows.length) await sleep(delayMs);
  }

  console.log(`\nExamined: ${examined}  Updated: ${updated}  Skipped: ${skipped}`);
  if (!apply) console.log("\nDry run complete. Re-run with --apply to write updates.");
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
