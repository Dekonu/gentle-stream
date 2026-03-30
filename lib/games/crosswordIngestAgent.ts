/**
 * Crossword Ingest Agent
 *
 * Step 1 (algorithmic): fill a 7×7 grid using crosswordGridFiller.ts
 * Step 2 (clues): Wiktionary + Datamuse heuristics by default, or Claude when
 *                 CROSSWORD_CLUES_SOURCE=anthropic
 * Step 3 (DB):  store the complete puzzle in the games table
 *
 * Run via manual script if you need legacy word-square top-up (see package.json).
 * Production cron uses blocked 7×7 ingest (`blockedCrosswordIngestAgent`).
 */

import { allCrosswordSlotsHaveRealClues, clueForSlot } from "./crosswordClueMerge";
import { fetchCrosswordCluesFromAnthropic } from "./crosswordAnthropicClues";
import {
  crosswordCluesPreferAnthropic,
  fetchCrosswordCluesHeuristic,
} from "./crosswordHeuristicClues";
import { fillCrosswordGrid, type CrosswordSlot } from "./crosswordGridFiller";
import { db } from "../db/client";
import { getDefaultFlavorForGameType } from "../db/gameFlavorDefaults";
import type { Category } from "../constants";
import { CATEGORIES } from "../constants";

// How many crosswords to pre-generate per category per run
const PUZZLES_PER_CATEGORY = 2;
// Minimum pool size before we top up
export const MIN_CROSSWORD_POOL = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CrosswordPuzzle {
  grid: string[][];
  slots: (CrosswordSlot & { clue: string })[];
  category: string;
  difficulty: "medium"; // crosswords are always medium difficulty
  /** word_square (5×5) vs blocked_mini (7×7 asymmetric) */
  variant?: "word_square" | "blocked_mini";
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runCrosswordIngest(
  targetCategory?: Category
): Promise<number> {
  if (crosswordCluesPreferAnthropic() && !process.env.ANTHROPIC_API_KEY?.trim()) {
    throw new Error(
      "CROSSWORD_CLUES_SOURCE=anthropic requires ANTHROPIC_API_KEY"
    );
  }

  const categories = targetCategory ? [targetCategory] : [...CATEGORIES];
  let inserted = 0;

  for (const category of categories) {
    for (let i = 0; i < PUZZLES_PER_CATEGORY; i++) {
      try {
        const puzzle = await generateOneCrossword(category);
        if (!puzzle) {
          console.warn(`[CrosswordIngest] Grid fill failed for "${category}" attempt ${i + 1}`);
          continue;
        }

        await storePuzzle(puzzle);
        inserted++;
        console.log(`[CrosswordIngest] Stored crossword for "${category}" (${i + 1}/${PUZZLES_PER_CATEGORY})`);

        // Brief pause between API calls to avoid rate limiting
        if (i < PUZZLES_PER_CATEGORY - 1) {
          await sleep(2000);
        }
      } catch (e) {
        console.error(`[CrosswordIngest] Error for "${category}":`, e);
      }
    }
  }

  return inserted;
}

/** Returns current pool size for crosswords */
export async function getCrosswordPoolSize(): Promise<number> {
  const { count, error } = await db
    .from("games")
    .select("*", { count: "exact", head: true })
    .eq("type", "crossword")
    .gt("used_count", -1); // all rows
  if (error) throw new Error(`getCrosswordPoolSize: ${error.message}`);
  return count ?? 0;
}

// ─── Generation ───────────────────────────────────────────────────────────────

async function generateOneCrossword(
  category: string
): Promise<CrosswordPuzzle | null> {
  // Step 1: fill grid algorithmically
  const filled = fillCrosswordGrid(category);
  if (!filled) return null;

  const { grid, slots } = filled;

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  const clues =
    crosswordCluesPreferAnthropic() && apiKey
      ? await fetchCrosswordCluesFromAnthropic(apiKey, slots, category)
      : await fetchCrosswordCluesHeuristic(slots, category);

  // Step 3: merge clues into slots (per slot id — answer alone can repeat in word squares)
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
      `[CrosswordIngest] Incomplete or placeholder clues for "${category}" — not storing`
    );
    return null;
  }

  return {
    grid,
    slots: slotsWithClues,
    category,
    difficulty: "medium",
    variant: "word_square",
  };
}

// ─── DB storage ───────────────────────────────────────────────────────────────

async function storePuzzle(puzzle: CrosswordPuzzle): Promise<void> {
  const flavor = await getDefaultFlavorForGameType("crossword");
  const { error } = await db.from("games").insert({
    type: "crossword",
    difficulty: puzzle.difficulty,
    flavor,
    category: null,
    payload: puzzle as unknown as Record<string, unknown>,
    used_count: 0,
  });

  if (error) throw new Error(`storePuzzle: ${error.message}`);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
