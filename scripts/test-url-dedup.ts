/**
 * Test: URL-based deduplication
 *
 * Verifies that:
 *   1. normaliseUrl strips scheme, www, query params, trailing slashes
 *   2. insertArticles blocks an article whose source URLs overlap with
 *      a stored article — even when the headline is completely different
 *   3. Articles with no overlapping URLs are not affected
 *
 * Zero Claude API calls. Writes real rows then cleans up.
 *
 * Run from project root:
 *   npx tsx scripts/test-url-dedup.ts
 */

import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import { normaliseUrl } from "../lib/articles/dedup-keys";
config({ path: ".env.local" });

let insertArticles: typeof import("../lib/db/articles").insertArticles;
let db: typeof import("../lib/db/client").db;

/** Isolates fingerprints and URLs from other CI jobs on a shared DB. */
let runTag = "";

function headline(rest: string): string {
  return `TEST_URL_DEDUP_${runTag} ${rest}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function initDeps() {
  const [articlesMod, clientMod] = await Promise.all([
    import("../lib/db/articles"),
    import("../lib/db/client"),
  ]);
  insertArticles = articlesMod.insertArticles;
  db = clientMod.db;
}

const SOURCE_URL_WAIT_MS = process.env.CI ? 60_000 : 20_000;

/** CI delay (ms) before a second `insertArticles` that relies on URL overlap — helps read replicas. */
const DEDUP_FOLLOWUP_DELAY_MS = process.env.CI ? 4_000 : 250;

function insertResponseHasNormalisedUrls(
  inserted: { sourceUrls: string[] },
  expectedNormalised: string[]
): boolean {
  // `insertArticles` persists `normaliseUrl` output; compare directly.
  const have = new Set(inserted.sourceUrls ?? []);
  return expectedNormalised.every((n) => have.has(n));
}

/**
 * Ensures URL dedup metadata is ready before the next insert that calls `findUrlConflict`.
 *
 * Prefer the row returned by `insertArticles` (same write/response path as the upsert). Polling
 * `articles.source_urls` by id alone can time out on CI when follow-up reads hit a replica that
 * has not caught up yet — even though the insert response already contained the URLs.
 */
async function waitForDedupReadiness(
  inserted: { id: string; sourceUrls: string[] },
  expectedNormalised: string[]
): Promise<void> {
  if (expectedNormalised.length === 0) return;

  if (insertResponseHasNormalisedUrls(inserted, expectedNormalised)) {
    console.log("  ✓  source_urls confirmed from insert response (skipping long poll)");
  } else {
    await waitForArticleSourceUrlsVisible(inserted.id, expectedNormalised);
  }

  await waitUntilUrlOverlapQueryable(expectedNormalised);
  await sleep(DEDUP_FOLLOWUP_DELAY_MS);
}

async function waitUntilUrlOverlapQueryable(
  expectedNormalised: string[],
  maxWaitMs = SOURCE_URL_WAIT_MS
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const { data, error } = await db
      .from("articles")
      .select("id,source_urls")
      .overlaps("source_urls", expectedNormalised)
      .limit(1);
    if (error) throw new Error(`waitUntilUrlOverlapQueryable: ${error.message}`);
    if ((data?.length ?? 0) > 0) {
      console.log("  ✓  URL overlap query sees the inserted row");
      return;
    }
    await sleep(250);
  }
  throw new Error(
    `Timeout waiting for overlap query visibility for [${expectedNormalised.join(", ")}]`
  );
}

/**
 * Fallback: poll until `source_urls` is visible on a follow-up SELECT (e.g. empty insert response).
 */
async function waitForArticleSourceUrlsVisible(
  articleId: string,
  expectedNormalised: string[],
  maxWaitMs = SOURCE_URL_WAIT_MS
): Promise<void> {
  if (expectedNormalised.length === 0) return;
  const want = new Set(expectedNormalised);
  const deadline = Date.now() + maxWaitMs;
  let lastUrls: string[] = [];
  while (Date.now() < deadline) {
    const { data, error } = await db
      .from("articles")
      .select("source_urls")
      .eq("id", articleId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const urls = (data?.source_urls as string[] | null) ?? [];
    lastUrls = urls;
    const urlSet = new Set(urls);
    let ok = true;
    for (const n of want) {
      if (!urlSet.has(n)) {
        ok = false;
        break;
      }
    }
    if (ok) return;
    await sleep(200);
  }
  throw new Error(
    `Timeout waiting for article ${articleId} source_urls ⊇ [${expectedNormalised.join(", ")}] — last read: [${lastUrls.join(", ")}]`
  );
}

/** Same replica pause as `waitForDedupReadiness` when the next insert only needs fingerprint overlap. */
async function afterFingerprintInsertReady(): Promise<void> {
  console.log("  ✓  fingerprint dedup pause (insert succeeded; skip replica poll)");
  await sleep(DEDUP_FOLLOWUP_DELAY_MS);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const insertedIds: string[] = [];

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    if (detail) console.error(`     Got: ${detail}`);
    failed++;
  }
}

function insertBlockedDuplicate(originalId: string, batch: { id: string }[]): boolean {
  if (batch.length === 0) return true;
  if (batch.length === 1 && batch[0]!.id === originalId) return true;
  return false;
}

const BASE = {
  subheadline: "sub", byline: "By Test", location: "Global",
  category: "Education" as const,
  body: "Para one.\n\nPara two.\n\nPara three.",
  pullQuote: "quote", imagePrompt: "img",
  tags: [], sentiment: "uplifting" as const, emotions: [],
  locale: "global", readingTimeSecs: 60, qualityScore: 0.5,
};

// ─── Unit tests for normaliseUrl (no DB) ──────────────────────────────────────

function testNormaliseUrl() {
  console.log("\n── normaliseUrl unit tests ────────────────────────────────────");

  const cases: [string, string, string][] = [
    [
      "https://www.bbc.com/news/article-123?source=rss&ref=home",
      "bbc.com/news/article-123",
      "strips https, www, query string",
    ],
    [
      "http://bbc.com/news/article-123/",
      "bbc.com/news/article-123",
      "strips http, trailing slash",
    ],
    [
      "https://BBC.COM/News/Article-123",
      "bbc.com/news/article-123",
      "lowercases host and path",
    ],
    [
      "https://reuters.com/world/story#comments",
      "reuters.com/world/story",
      "strips fragment",
    ],
    [
      "https://www.nature.com/articles/s41586-024-00001-1",
      "nature.com/articles/s41586-024-00001-1",
      "preserves path structure",
    ],
  ];

  for (const [input, expected, label] of cases) {
    const result = normaliseUrl(input);
    assert(result === expected, label, result);
  }
}

// ─── DB integration tests ──────────────────────────────────────────────────────

async function testUrlBlocksSameArticleDifferentTitle() {
  console.log("\n── URL overlap blocks same article with different headline ────");

  const sharedUrl = `https://www.bbc.com/news/science-TEST_URL_DEDUP-${runTag}-123`;

  const original = {
    ...BASE,
    headline: headline("Scientists Make Breakthrough Discovery"),
    sourceUrls: [sharedUrl],
  };

  const rephrased = {
    ...BASE,
    headline: headline("Researchers Achieve Major Scientific Advance"), // totally different title
    sourceUrls: [sharedUrl], // same underlying article
  };

  const first = await insertArticles([original]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "Original article inserted");
  const inserted = first[0]!;

  await waitForDedupReadiness(inserted, [normaliseUrl(sharedUrl)]);

  const second = await insertArticles([rephrased]);
  assert(
    insertBlockedDuplicate(inserted.id, second),
    "Rephrased article blocked — same URL already stored",
    `got ${second.length} row(s): ${second.map((r) => r.id).join(", ")}`
  );
}

async function testUrlVariantsNormalisedCorrectly() {
  console.log("\n── URL variants normalise to same key ─────────────────────────");

  const canonical = `https://www.nature.com/articles/TEST_URL_DEDUP_${runTag}_s41586`;

  const original = {
    ...BASE,
    headline: headline("Nature Study On Coral Reefs Alpha"),
    sourceUrls: [canonical],
  };

  // Same URL but with tracking params and different scheme
  const withTracking = {
    ...BASE,
    headline: headline("Nature Study On Coral Reefs Beta"), // different title
    sourceUrls: [`http://nature.com/articles/TEST_URL_DEDUP_${runTag}_s41586?utm_source=twitter`],
  };

  const first = await insertArticles([original]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "Original inserted");
  const inserted = first[0]!;

  await waitForDedupReadiness(inserted, [normaliseUrl(canonical)]);

  const second = await insertArticles([withTracking]);
  assert(
    insertBlockedDuplicate(inserted.id, second),
    "Tracking-param variant blocked — normalises to same URL",
    `got ${second.length} row(s): ${second.map((r) => r.id).join(", ")}`
  );
}

async function testDifferentUrlsNotBlocked() {
  console.log("\n── Different source URLs are not blocked ──────────────────────");

  const articleA = {
    ...BASE,
    headline: headline("Unrelated Article Alpha"),
    sourceUrls: [`https://bbc.com/news/TEST_URL_DEDUP_${runTag}_article_alpha`],
  };

  const articleB = {
    ...BASE,
    headline: headline("Unrelated Article Beta"),
    sourceUrls: [`https://reuters.com/world/TEST_URL_DEDUP_${runTag}_article_beta`],
  };

  const first = await insertArticles([articleA]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "Article A inserted");

  const second = await insertArticles([articleB]);
  insertedIds.push(...second.map((a) => a.id));
  assert(second.length === 1, "Article B inserted — different URLs, not blocked");
}

async function testPartialUrlOverlap() {
  console.log("\n── Partial URL overlap (one shared source) is blocked ─────────");

  const sharedUrl = `https://sciencedaily.com/releases/TEST_URL_DEDUP_${runTag}_shared`;

  const original = {
    ...BASE,
    headline: headline("Partial Overlap Original Article"),
    sourceUrls: [
      sharedUrl,
      `https://phys.org/news/TEST_URL_DEDUP_${runTag}_other`,
    ],
  };

  const partial = {
    ...BASE,
    headline: headline("Partial Overlap New Article"),
    sourceUrls: [
      sharedUrl, // shared
      `https://newscientist.com/article/TEST_URL_DEDUP_${runTag}_different`, // unique
    ],
  };

  const first = await insertArticles([original]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "Original inserted");
  const inserted = first[0]!;

  await waitForDedupReadiness(inserted, [
    normaliseUrl(sharedUrl),
    normaliseUrl(`https://phys.org/news/TEST_URL_DEDUP_${runTag}_other`),
  ]);

  const second = await insertArticles([partial]);
  assert(
    insertBlockedDuplicate(inserted.id, second),
    "Partial overlap (1 shared URL) correctly blocked",
    `got ${second.length} row(s): ${second.map((r) => r.id).join(", ")}`
  );
}

async function testNoSourceUrls() {
  console.log("\n── Articles with no source URLs fall back to fingerprint ──────");

  const a = {
    ...BASE,
    headline: headline("No Source URL Article One"),
    sourceUrls: [],
  };

  const b = {
    ...BASE,
    headline: headline("No Source URL Article One"), // exact duplicate
    sourceUrls: [],
  };

  const first = await insertArticles([a]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "First article (no URLs) inserted");

  await afterFingerprintInsertReady();

  const second = await insertArticles([b]);
  assert(
    insertBlockedDuplicate(first[0]!.id, second),
    "Identical headline with no URLs still blocked by fingerprint",
    `got ${second.length} row(s): ${second.map((r) => r.id).join(", ")}`
  );
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  if (insertedIds.length === 0) return;
  const { error } = await db.from("articles").delete().in("id", insertedIds);
  if (error) {
    console.warn("\n⚠️  Cleanup failed:", error.message);
    console.warn("   Delete manually:", insertedIds);
  } else {
    console.log(`\n🧹 Cleaned up ${insertedIds.length} test row(s)`);
  }
}

async function preCleanup() {
  // These integration tests run against a shared Supabase DB, so older runs
  // can leave behind rows that would make "first insert" assertions fail.
  console.log("\n🧽 Pre-cleaning leftover test rows (dedup collisions)...");

  const { data: byHeadline, error: e1 } = await db
    .from("articles")
    .delete()
    .or(`headline.ilike.%TEST_DEDUP_${runTag}%,headline.ilike.%TEST_URL_DEDUP_${runTag}%`)
    .select("id");

  if (e1) throw new Error(e1.message);

  const n1 = byHeadline?.length ?? 0;
  console.log(`🧹 Removed ${n1} leftover row(s) before assertions`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("══════════════════════════════════════════════");
  console.log("  URL Deduplication Tests");
  console.log("══════════════════════════════════════════════");

  await initDeps();

  runTag = process.env.GITHUB_RUN_ID ?? randomBytes(6).toString("hex");
  console.log(`\n  Run tag: ${runTag} (isolates URLs/fingerprints from other jobs)\n`);

  // Unit tests (no DB)
  testNormaliseUrl();

  // Integration tests (real DB, cleaned up after)
  try {
    await preCleanup();
    await testUrlBlocksSameArticleDifferentTitle();
    await testUrlVariantsNormalisedCorrectly();
    await testDifferentUrlsNotBlocked();
    await testPartialUrlOverlap();
    await testNoSourceUrls();
  } finally {
    await cleanup();
  }

  console.log("\n══════════════════════════════════════════════");
  console.log(`  ${passed} passed  |  ${failed} failed`);
  console.log("══════════════════════════════════════════════\n");

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
