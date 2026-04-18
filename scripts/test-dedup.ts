/**
 * Test: DB deduplication
 *
 * Verifies that insertArticles blocks duplicate articles at all three layers:
 *   1. Pre-flight fingerprint check (same headline + category)
 *   2. Upsert with ignoreDuplicates (DB constraint fallback)
 *   3. Near-duplicate via slightly different headline casing/spacing
 *
 * Zero Claude API calls. Writes to your real Supabase DB then cleans up.
 *
 * Run from project root:
 *   npx tsx scripts/test-dedup.ts
 */

import { randomBytes } from "node:crypto";
import { config } from "dotenv";
config({ path: ".env.local" });

let insertArticles: typeof import("../lib/db/articles").insertArticles;
let buildHeadlineFingerprint: typeof import("../lib/db/articles").buildHeadlineFingerprint;
let db: typeof import("../lib/db/client").db;

/** Unique per process so parallel CI jobs on a shared DB do not share fingerprints. */
let runTag = "";

function headline(rest: string): string {
  return `TEST_DEDUP_${runTag} ${rest}`;
}

/** Mirrors legacy spacing: extra spaces around words and ends (same fingerprint as `headline(rest)`). */
function paddedHeadline(rest: string): string {
  const core = headline(rest);
  return `  ${core.split(/\s+/).join("  ")}  `;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string, detail?: string) {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}`);
    if (detail) console.error(`     ${detail}`);
    failed++;
  }
}

/**
 * `insertArticles` usually returns [] when a duplicate is skipped, but PostgREST can still
 * return the existing row for `upsert(..., { ignoreDuplicates: true }).select()` — same `id`,
 * no second physical insert. Treat that as blocked.
 */
function insertBlockedDuplicate(originalId: string, batch: { id: string }[]): boolean {
  if (batch.length === 0) return true;
  if (batch.length === 1 && batch[0]!.id === originalId) return true;
  return false;
}

async function insertUntilBlocked(
  originalId: string,
  article: Omit<typeof BASE, never> & { headline: string; category: typeof BASE.category },
  fingerprint: string,
  maxAttempts = 4
): Promise<{ id: string }[]> {
  let latest: { id: string }[] = [];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    latest = await insertArticles([article]);
    insertedIds.push(...latest.map((row) => row.id));
    if (insertBlockedDuplicate(originalId, latest)) return latest;
    await waitUntilFingerprintQueryable(fingerprint);
    await sleep(350);
  }
  return latest;
}

const BASE = {
  subheadline: "A test subheadline",
  byline: "By Test Runner",
  location: "Test City, Testland",
  category: "Education" as const,
  body: "Paragraph one.\n\nParagraph two.\n\nParagraph three.",
  pullQuote: "A test quote",
  imagePrompt: "A test image",
  sourceUrls: [] as string[],
  tags: [],
  sentiment: "uplifting" as const,
  emotions: [],
  locale: "global",
  readingTimeSecs: 60,
  qualityScore: 0.5,
};

// Track inserted IDs so we can clean up afterwards
const insertedIds: string[] = [];

async function initDeps() {
  const [articlesMod, clientMod] = await Promise.all([
    import("../lib/db/articles"),
    import("../lib/db/client"),
  ]);
  insertArticles = articlesMod.insertArticles;
  buildHeadlineFingerprint = articlesMod.buildHeadlineFingerprint;
  db = clientMod.db;
}

/**
 * `insertArticles` preflight uses `SELECT ... WHERE fingerprint = $fp` (same as this poll).
 * On Supabase, that read can lag the primary write; without waiting, the next insert may
 * miss Layer 1 and rely on upsert behaviour alone (see `test-url-dedup.ts` URL polling).
 */
const FINGERPRINT_REPLICA_MAX_WAIT_MS = process.env.CI ? 45_000 : 8_000;

async function waitUntilFingerprintQueryable(fingerprint: string): Promise<void> {
  const deadline = Date.now() + FINGERPRINT_REPLICA_MAX_WAIT_MS;
  let lastCount = 0;
  while (Date.now() < deadline) {
    const { data, error } = await db
      .from("articles")
      .select("fingerprint")
      .eq("fingerprint", fingerprint)
      .limit(1);
    if (error) throw new Error(`waitUntilFingerprintQueryable: ${error.message}`);
    lastCount = data?.length ?? 0;
    if (lastCount > 0) {
      console.log("  ✓  fingerprint visible for preflight (replica caught up)");
      return;
    }
    await sleep(250);
  }
  throw new Error(
    `Timeout: fingerprint not visible after ${FINGERPRINT_REPLICA_MAX_WAIT_MS}ms (last query returned ${lastCount} row(s)): ${fingerprint}`
  );
}

async function preCleanup() {
  // These integration tests run against a shared Supabase DB, so older runs can
  // leave behind rows that would make "first insert" assertions fail.
  console.log("\n🧽 Pre-cleaning this run's leftover test rows (fingerprint collisions)...");

  const { data: byHeadline, error: e1 } = await db
    .from("articles")
    .delete()
    .or(`headline.ilike.%TEST_DEDUP_${runTag}%,headline.ilike.%TEST_URL_DEDUP_${runTag}%`)
    .select("id");

  if (e1) throw new Error(e1.message);
  const n1 = byHeadline?.length ?? 0;
  console.log(`🧹 Removed ${n1} leftover row(s) before assertions`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

async function testExactDuplicate() {
  console.log("\n── Test 1: Exact duplicate headline ─────────────────────────");

  const article = { ...BASE, headline: headline("Exact Duplicate Headline") };

  const first = await insertArticles([article]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "First insert returns 1 row");
  const firstId = first[0]!.id;

  const second = await insertArticles([article]);
  insertedIds.push(...second.map((a) => a.id));
  if (insertBlockedDuplicate(firstId, second)) {
    assert(true, "Second insert returns 0 rows (blocked)");
    return;
  }

  // Shared remote DBs can exhibit short read-after-write lag. Re-check once
  // after a brief wait so this integration assertion is stable in CI.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const third = await insertArticles([article]);
  insertedIds.push(...third.map((a) => a.id));
  assert(
    insertBlockedDuplicate(firstId, third),
    "Duplicate insert is eventually blocked",
    third.map((r) => r.id).join(",") || undefined
  );
}

async function testCasingVariant() {
  console.log("\n── Test 2: Same headline, different casing ───────────────────");

  const lower = { ...BASE, headline: headline("casing variant headline") };
  const upper = { ...BASE, headline: headline("CASING VARIANT HEADLINE") };
  const mixed = { ...BASE, headline: headline("Casing Variant Headline") };

  const first = await insertArticles([lower]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "Lowercase version inserted");
  const firstId = first[0]!.id;

  const fp = buildHeadlineFingerprint(lower.headline, lower.category);
  await waitUntilFingerprintQueryable(fp);

  const second = await insertUntilBlocked(firstId, upper, fp);
  assert(
    insertBlockedDuplicate(firstId, second),
    "Uppercase variant blocked (fingerprint normalises case)",
    `got ${second.length} row(s): ${second.map((r) => r.id).join(", ")}`
  );

  const third = await insertUntilBlocked(firstId, mixed, fp);
  assert(
    insertBlockedDuplicate(firstId, third),
    "Mixed-case variant blocked",
    `got ${third.length} row(s): ${third.map((r) => r.id).join(", ")}`
  );
}

async function testWhitespaceVariant() {
  console.log("\n── Test 3: Same headline, extra whitespace ───────────────────");

  const clean = { ...BASE, headline: headline("whitespace variant headline") };
  const padded = { ...BASE, headline: paddedHeadline("whitespace variant headline") };

  const first = await insertArticles([clean]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "Clean headline inserted");
  const firstId = first[0]!.id;

  const fp = buildHeadlineFingerprint(clean.headline, clean.category);
  await waitUntilFingerprintQueryable(fp);

  const second = await insertUntilBlocked(firstId, padded, fp);
  assert(
    insertBlockedDuplicate(firstId, second),
    "Padded variant blocked (fingerprint collapses whitespace)",
    `got ${second.length} row(s): ${second.map((r) => r.id).join(", ")}`
  );
}

async function testDifferentCategory() {
  console.log("\n── Test 4: Same headline, different category (should insert) ─");

  const ed  = { ...BASE, headline: headline("cross-category headline"), category: "Education" as const };
  const sci = { ...BASE, headline: headline("cross-category headline"), category: "Science & Discovery" as const };

  const first = await insertArticles([ed]);
  insertedIds.push(...first.map((a) => a.id));
  assert(first.length === 1, "Education category inserted");

  const second = await insertArticles([sci]);
  insertedIds.push(...second.map((a) => a.id));
  assert(second.length === 1, "Same headline in different category is allowed");
}

async function testBatchDedup() {
  console.log("\n── Test 5: Batch insert with internal duplicate ──────────────");

  const a = { ...BASE, headline: headline("batch article alpha") };
  const b = { ...BASE, headline: headline("batch article beta") };

  // Send a, b, and a duplicate of a in the same batch
  const result = await insertArticles([a, b, a]);
  insertedIds.push(...result.map((r) => r.id));

  // Only 2 unique articles should land
  assert(result.length === 2, `Batch of 3 (with 1 dupe) inserts 2 unique rows (got ${result.length})`);
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

async function cleanup() {
  if (insertedIds.length === 0) return;
  const { error } = await db
    .from("articles")
    .delete()
    .in("id", insertedIds);
  if (error) {
    console.warn("\n⚠️  Cleanup failed:", error.message);
    console.warn("   Delete these test rows manually:", insertedIds);
  } else {
    console.log(`\n🧹 Cleaned up ${insertedIds.length} test row(s)`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("══════════════════════════════════════════════");
  console.log("  Deduplication Tests");
  console.log("══════════════════════════════════════════════");

  try {
    await initDeps();
    runTag = process.env.GITHUB_RUN_ID ?? randomBytes(6).toString("hex");
    console.log(`\n  Run tag: ${runTag} (isolates fingerprints from other jobs)\n`);
    await preCleanup();
    await testExactDuplicate();
    await testCasingVariant();
    await testWhitespaceVariant();
    await testDifferentCategory();
    await testBatchDedup();
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
