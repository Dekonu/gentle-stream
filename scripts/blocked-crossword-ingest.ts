/**
 * Manual blocked-crossword ingest (algorithmic fill + Claude clues → games).
 *
 *   npx tsx scripts/blocked-crossword-ingest.ts
 *   npx tsx scripts/blocked-crossword-ingest.ts --category "Science"
 */

import { config } from "dotenv";

config({ path: ".env.local" });

import type { Category } from "../lib/constants";
import { CATEGORIES } from "../lib/constants";
import {
  runBlockedCrosswordIngest,
  MAX_CROSSWORDS_IN_POOL,
} from "../lib/games/blockedCrosswordIngestAgent";
import { getCrosswordPoolSize } from "../lib/games/crosswordIngestAgent";

function argCategory(): Category | undefined {
  const i = process.argv.indexOf("--category");
  if (i === -1 || !process.argv[i + 1]) return undefined;
  const name = process.argv[i + 1];
  if (!CATEGORIES.includes(name as Category)) {
    console.error(`Unknown category: ${name}`);
    process.exit(1);
  }
  return name as Category;
}

async function main() {
  const before = await getCrosswordPoolSize();
  console.log(`Crossword pool before: ${before} (cap ${MAX_CROSSWORDS_IN_POOL})`);
  const cat = argCategory();
  const n = await runBlockedCrosswordIngest(cat);
  const after = await getCrosswordPoolSize();
  console.log(`Inserted ${n} puzzle(s). Pool after: ${after}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
