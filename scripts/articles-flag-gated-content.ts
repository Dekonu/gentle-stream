/**
 * Detect likely gated/paywalled teaser articles in existing ingest rows and
 * optionally flag them via moderation fields + lower quality score.
 *
 * Default mode is DRY RUN (no updates). Use --apply to write changes.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/articles-flag-gated-content.ts dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-flag-gated-content.ts --apply --max-rows=200 dotenv_config_path=.env.local
 */

import { db } from "../lib/db/client";
import { assessGatedContent } from "../lib/articles/gatedContentHeuristics";

interface ArticleRow {
  id: string;
  headline: string;
  subheadline: string | null;
  body: string;
  quality_score: number | null;
  moderation_status: string | null;
  moderation_labels: Record<string, unknown> | null;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const apply = parseArg("apply") === "true";
  const maxRows = parseIntArg("max-rows", 400);
  const delayMs = parseIntArg("delay-ms", 200);
  const category = parseArg("category");
  const singleId = parseArg("id");

  let query = db
    .from("articles")
    .select("id, headline, subheadline, body, quality_score, moderation_status, moderation_labels")
    .eq("source", "ingest")
    .eq("content_kind", "news")
    .is("deleted_at", null);
  if (category) query = query.eq("category", category);
  if (singleId) query = query.eq("id", singleId);

  const { data, error } = await query.order("fetched_at", { ascending: false }).limit(maxRows);
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ArticleRow[];
  let examined = 0;
  let flagged = 0;
  let updated = 0;

  console.log("══════════════════════════════════════════════");
  console.log("  Gated content heuristic audit");
  console.log("══════════════════════════════════════════════");
  console.log(`Mode: ${apply ? "APPLY (will update)" : "DRY RUN (no updates)"}`);
  console.log(`Rows loaded: ${rows.length}  delay-ms: ${delayMs}`);

  for (const row of rows) {
    examined += 1;
    const gated = assessGatedContent({
      headline: row.headline,
      subheadline: row.subheadline,
      body: row.body,
    });
    if (!gated.isLikelyGated) {
      if (examined < rows.length) await sleep(delayMs);
      continue;
    }

    flagged += 1;
    console.log(
      `[${apply ? "apply" : "dry"} ${row.id}] score=${gated.score} reasons=${gated.reasons.join(",") || "n/a"}`
    );

    if (apply) {
      const mergedLabels = {
        ...(row.moderation_labels ?? {}),
        ingest_gated: true,
        ingest_gated_score: gated.score,
        ingest_gated_reasons: gated.reasons,
      };

      const { error: upErr } = await db
        .from("articles")
        .update({
          quality_score:
            row.quality_score == null ? gated.suggestedQualityScore : Math.min(row.quality_score, gated.suggestedQualityScore),
          moderation_status: "flagged",
          moderation_reason: `Likely gated teaser content (${gated.reasons.join(", ") || "heuristic"})`,
          moderation_confidence: Math.min(0.99, gated.score / 5),
          moderation_labels: mergedLabels,
        })
        .eq("id", row.id);

      if (upErr) console.error(`[error ${row.id}] ${upErr.message}`);
      else updated += 1;
    }

    if (examined < rows.length) await sleep(delayMs);
  }

  console.log(`\nExamined: ${examined}  Flagged: ${flagged}  Updated: ${updated}`);
  if (!apply) console.log("\nDry run complete. Re-run with --apply to write updates.");
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});
