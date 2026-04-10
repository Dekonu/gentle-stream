/**
 * Decode XML/HTML entities in already-ingested article titles/subheadlines.
 *
 * Default mode is DRY RUN (no updates). Use --apply to write changes.
 *
 * Usage:
 *   npx tsx -r dotenv/config scripts/articles-decode-rss-entities.ts dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-decode-rss-entities.ts --apply dotenv_config_path=.env.local
 *   npx tsx -r dotenv/config scripts/articles-decode-rss-entities.ts --apply --max-rows=10000 dotenv_config_path=.env.local
 */

import { buildHeadlineFingerprint } from "../lib/db/articles";
import { db } from "../lib/db/client";
import { decodeXmlEntities, hasXmlEntities } from "../lib/rss/xml-entities";

interface ArticleRow {
  id: string;
  category: string;
  headline: string;
  subheadline: string | null;
  fetched_at: string;
}

interface ChangeRow {
  id: string;
  category: string;
  beforeHeadline: string;
  afterHeadline: string;
  beforeSubheadline: string;
  afterSubheadline: string;
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

function buildEntityFilter(): string {
  const markers = ["amp", "lt", "gt", "quot", "apos", "#"];
  const fields = ["headline", "subheadline"];
  const clauses: string[] = [];
  for (const field of fields) {
    for (const marker of markers) {
      clauses.push(`${field}.ilike.%&${marker}%`);
    }
  }
  return clauses.join(",");
}

async function loadCandidates(maxRows: number): Promise<ArticleRow[]> {
  const out: ArticleRow[] = [];
  const pageSize = 500;
  const filter = buildEntityFilter();

  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const { data, error } = await db
      .from("articles")
      .select("id,category,headline,subheadline,fetched_at")
      .or(filter)
      .order("fetched_at", { ascending: false })
      .range(offset, Math.min(offset + pageSize - 1, maxRows - 1));

    if (error) throw new Error(`loadCandidates: ${error.message}`);
    const rows = (data ?? []) as ArticleRow[];
    if (rows.length === 0) break;
    out.push(...rows);
    if (rows.length < pageSize) break;
  }

  return out;
}

function collectChanges(rows: ArticleRow[]): ChangeRow[] {
  const changes: ChangeRow[] = [];
  for (const row of rows) {
    const beforeHeadline = row.headline ?? "";
    const beforeSubheadline = row.subheadline ?? "";
    if (!hasXmlEntities(beforeHeadline) && !hasXmlEntities(beforeSubheadline)) continue;

    const afterHeadline = decodeXmlEntities(beforeHeadline);
    const afterSubheadline = decodeXmlEntities(beforeSubheadline);
    if (
      afterHeadline === beforeHeadline &&
      afterSubheadline === beforeSubheadline
    ) {
      continue;
    }

    changes.push({
      id: row.id,
      category: row.category,
      beforeHeadline,
      afterHeadline,
      beforeSubheadline,
      afterSubheadline,
    });
  }
  return changes;
}

async function applyChanges(changes: ChangeRow[]): Promise<number> {
  let updated = 0;
  for (const change of changes) {
    const payload = {
      headline: change.afterHeadline,
      subheadline: change.afterSubheadline,
      fingerprint: buildHeadlineFingerprint(
        change.afterHeadline,
        change.category
      ),
    };
    const { data, error } = await db
      .from("articles")
      .update(payload)
      .eq("id", change.id)
      .select("id");
    if (error) throw new Error(`applyChanges(${change.id}): ${error.message}`);
    updated += data?.length ?? 0;
  }
  return updated;
}

async function main() {
  const apply = parseArg("apply") === "true";
  const maxRows = parseIntArg("max-rows", 5000);

  console.log("══════════════════════════════════════════════");
  console.log("  Article RSS Entity Decode Patch");
  console.log("══════════════════════════════════════════════");
  console.log(`Mode: ${apply ? "APPLY (will update)" : "DRY RUN (no updates)"}`);
  console.log(`Scan max rows: ${maxRows}`);

  const rows = await loadCandidates(maxRows);
  const changes = collectChanges(rows);

  console.log(`Rows scanned: ${rows.length}`);
  console.log(`Rows needing patch: ${changes.length}`);

  for (const sample of changes.slice(0, 12)) {
    console.log(`\n[${sample.id}]`);
    console.log(`Before: ${sample.beforeHeadline}`);
    console.log(`After:  ${sample.afterHeadline}`);
  }

  if (!apply) {
    console.log("\nDry run complete. Re-run with --apply to patch these rows.");
    return;
  }

  const updated = await applyChanges(changes);
  console.log(`\nUpdated rows: ${updated}`);
}

main().catch((error) => {
  console.error("Fatal:", error);
  process.exit(1);
});

