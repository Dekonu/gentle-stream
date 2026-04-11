/**
 * Reflow RSS narrative bodies to remove UI chrome/credits and split run-on text.
 *
 * Default mode is DRY RUN (no updates). Use --apply to write changes.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/articles-reflow-rss-bodies.ts dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-reflow-rss-bodies.ts --apply dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-reflow-rss-bodies.ts --apply --max-rows=5000 dotenv_config_path=.env.local
 */

import { db } from "../lib/db/client";
import { normalizeRssNarrativeText } from "../lib/rss/rssNarrativeMerge";

const RSS_FOOTER_MARKER = "This report is sourced directly from the original RSS item";

interface ArticleRow {
  id: string;
  headline: string;
  subheadline: string | null;
  body: string;
  pull_quote: string | null;
  reading_time_secs: number | null;
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

function firstSentence(value: string): string {
  const match = value.match(/^[^.!?]+[.!?]?/);
  return (match?.[0] ?? value).trim();
}

function trimToLength(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function estimateReadingTime(body: string): number {
  return Math.round((body.split(/\s+/).filter(Boolean).length / 200) * 60);
}

function splitRssBody(body: string): { narrative: string; footer: string | null } {
  const markerIndex = body.indexOf(RSS_FOOTER_MARKER);
  if (markerIndex < 0) return { narrative: body.trim(), footer: null };
  return {
    narrative: body.slice(0, markerIndex).trim(),
    footer: body.slice(markerIndex).trim(),
  };
}

async function loadCandidates(maxRows: number): Promise<ArticleRow[]> {
  const { data, error } = await db
    .from("articles")
    .select("id,headline,subheadline,body,pull_quote,reading_time_secs")
    .eq("source", "ingest")
    .eq("content_kind", "news")
    .is("deleted_at", null)
    .ilike("body", `%${RSS_FOOTER_MARKER}%`)
    .order("fetched_at", { ascending: false })
    .limit(maxRows);
  if (error) throw new Error(`loadCandidates: ${error.message}`);
  return (data ?? []) as ArticleRow[];
}

async function main() {
  const apply = parseArg("apply") === "true";
  const maxRows = parseIntArg("max-rows", 2000);

  console.log("══════════════════════════════════════════════");
  console.log("  RSS narrative body reflow");
  console.log("══════════════════════════════════════════════");
  console.log(`Mode: ${apply ? "APPLY (will update)" : "DRY RUN (no updates)"}`);
  console.log(`Scan max rows: ${maxRows}`);

  const rows = await loadCandidates(maxRows);
  let changed = 0;
  let updated = 0;

  for (const row of rows) {
    const split = splitRssBody(row.body ?? "");
    if (!split.narrative) continue;

    const reflowed = normalizeRssNarrativeText(split.narrative);
    if (!reflowed) continue;

    const nextBody = split.footer ? `${reflowed}\n\n${split.footer}` : reflowed;
    if (nextBody === (row.body ?? "").trim()) continue;
    changed += 1;

    const nextPullQuote = trimToLength(firstSentence(row.subheadline?.trim() || reflowed), 240);
    const nextReadingTimeSecs = estimateReadingTime(nextBody);

    console.log(
      `[${apply ? "apply" : "dry"} ${row.id}] ${row.headline.slice(0, 64)}… ` +
        `body ${(row.body ?? "").length}→${nextBody.length} chars`
    );

    if (!apply) continue;

    const { error } = await db
      .from("articles")
      .update({
        body: nextBody,
        pull_quote: nextPullQuote,
        reading_time_secs: nextReadingTimeSecs,
      })
      .eq("id", row.id);
    if (error) {
      console.error(`[error ${row.id}] ${error.message}`);
      continue;
    }
    updated += 1;
  }

  console.log(`\nScanned: ${rows.length}`);
  console.log(`Changed: ${changed}`);
  if (apply) console.log(`Updated: ${updated}`);
  else console.log("\nDry run complete. Re-run with --apply to write updates.");
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
