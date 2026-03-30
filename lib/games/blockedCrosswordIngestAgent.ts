/**
 * Precompute asymmetric blocked 7×7 crosswords into `games` (type crossword).
 * Hard cap on total crossword rows for the demo pool (Supabase).
 */

import { allCrosswordSlotsHaveRealClues, clueForSlot } from "./crosswordClueMerge";
import { fetchCrosswordCluesFromAnthropic } from "./crosswordAnthropicClues";
import {
  crosswordCluesPreferAnthropic,
  fetchCrosswordCluesHeuristic,
} from "./crosswordHeuristicClues";
import type { CrosswordPuzzle } from "./crosswordIngestAgent";
import { getCrosswordPoolSize } from "./crosswordIngestAgent";
import { tryGenerateBlockedCrossword } from "./blockedCrosswordGenerator";
import { db } from "../db/client";
import { getDefaultFlavorForGameType } from "../db/gameFlavorDefaults";
import type { Category } from "../constants";
import { CATEGORIES } from "../constants";

/** Demo cap: total crossword rows in DB */
export const MAX_CROSSWORDS_IN_POOL = 500;

/** Per cron run — stay under serverless time limits */
const MAX_INSERT_PER_RUN = 6;

const SLEEP_MS = 2000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function storeBlockedPuzzle(puzzle: CrosswordPuzzle): Promise<void> {
  const flavor = await getDefaultFlavorForGameType("crossword");
  const { error } = await db.from("games").insert({
    type: "crossword",
    difficulty: puzzle.difficulty,
    flavor,
    category: null,
    payload: puzzle as unknown as Record<string, unknown>,
    used_count: 0,
  });
  if (error) throw new Error(`storeBlockedPuzzle: ${error.message}`);
}

async function generateOneBlockedCrossword(category: string): Promise<CrosswordPuzzle | null> {
  const filled = tryGenerateBlockedCrossword();
  if (!filled) return null;

  const { grid, slots } = filled;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const clues = crosswordCluesPreferAnthropic() && apiKey
    ? await fetchCrosswordCluesFromAnthropic(apiKey, slots, category)
    : await fetchCrosswordCluesHeuristic(slots, category);
  const slotsWithClues = slots.map((slot) => ({
    ...slot,
    clue: clueForSlot(
      slot,
      clues,
      (s) => `Definition needed (${s.length} letters)`
    ),
  }));

  if (!allCrosswordSlotsHaveRealClues(slotsWithClues)) {
    console.warn(
      `[BlockedCrosswordIngest] Incomplete or placeholder clues for "${category}" — not storing`
    );
    return null;
  }

  return {
    grid,
    slots: slotsWithClues,
    category,
    difficulty: "medium",
    variant: "blocked_mini",
  };
}

/**
 * Inserts blocked crosswords until pool reaches MAX_CROSSWORDS_IN_POOL or budget exhausted.
 */
export async function runBlockedCrosswordIngest(
  targetCategory?: Category
): Promise<number> {
  if (crosswordCluesPreferAnthropic() && !process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error(
      "CROSSWORD_CLUES_SOURCE=anthropic requires ANTHROPIC_API_KEY"
    );
  }

  let count = await getCrosswordPoolSize();
  if (count >= MAX_CROSSWORDS_IN_POOL) {
    console.log(
      `[BlockedCrosswordIngest] Pool at cap (${MAX_CROSSWORDS_IN_POOL}), skipping`
    );
    return 0;
  }

  const categories = targetCategory ? [targetCategory] : [...CATEGORIES];
  let inserted = 0;
  const budget = Math.min(MAX_INSERT_PER_RUN, MAX_CROSSWORDS_IN_POOL - count);

  for (let b = 0; b < budget; b++) {
    count = await getCrosswordPoolSize();
    if (count >= MAX_CROSSWORDS_IN_POOL) break;

    const category = categories[b % categories.length]!;
    try {
      const puzzle = await generateOneBlockedCrossword(category);
      if (!puzzle) {
        console.warn(
          `[BlockedCrosswordIngest] Fill failed for "${category}" (attempt ${b + 1})`
        );
        continue;
      }
      await storeBlockedPuzzle(puzzle);
      inserted++;
      console.log(
        `[BlockedCrosswordIngest] Stored blocked_mini for "${category}" (${inserted}/${budget})`
      );
    } catch (e) {
      console.error(`[BlockedCrosswordIngest] Error for "${category}":`, e);
    }

    if (b < budget - 1) await sleep(SLEEP_MS);
  }

  return inserted;
}
