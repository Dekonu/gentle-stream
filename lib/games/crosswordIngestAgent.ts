/**
 * Crossword Ingest Agent
 *
 * Step 1 (algorithmic): fill a 7×7 grid using crosswordGridFiller.ts
 * Step 2 (LLM): send the filled grid to Claude and ask it to write
 *               a clue for each answer word
 * Step 3 (DB):  store the complete puzzle in the games table
 *
 * One API call generates clues for the entire puzzle (all across + down).
 * Claude is given the answer words and category for context so clues
 * can be thematic and interesting rather than generic.
 *
 * Run via:
 *   - GET /api/cron/games   (production cron, every 2h)
 *   - npm run games:ingest  (manual dev run)
 */

import { fillCrosswordGrid, type CrosswordSlot } from "./crosswordGridFiller";
import { getWordBank } from "./crosswordWordList";
import { db } from "../db/client";
import type { Category } from "../constants";
import { CATEGORIES } from "../constants";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// How many crosswords to pre-generate per category per run
const PUZZLES_PER_CATEGORY = 2;
// Minimum pool size before we top up
export const MIN_CROSSWORD_POOL = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

interface ClueMap {
  [answer: string]: string; // e.g. { "ATOM": "Smallest unit of matter" }
}

export interface CrosswordPuzzle {
  grid: string[][];
  slots: (CrosswordSlot & { clue: string })[];
  category: string;
  difficulty: "medium"; // crosswords are always medium difficulty
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runCrosswordIngest(
  targetCategory?: Category
): Promise<number> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const categories = targetCategory ? [targetCategory] : [...CATEGORIES];
  let inserted = 0;

  for (const category of categories) {
    for (let i = 0; i < PUZZLES_PER_CATEGORY; i++) {
      try {
        const puzzle = await generateOneCrossword(apiKey, category);
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
  apiKey: string,
  category: string
): Promise<CrosswordPuzzle | null> {
  // Step 1: fill grid algorithmically
  const filled = fillCrosswordGrid(category);
  if (!filled) return null;

  const { grid, slots } = filled;

  // Step 2: get clues from Claude
  const clues = await fetchClues(apiKey, slots, category);

  // Step 3: merge clues into slots
  const slotsWithClues = slots.map((slot) => ({
    ...slot,
    clue: clues[slot.answer] ?? `Definition of ${slot.answer.toLowerCase()}`,
  }));

  return { grid, slots: slotsWithClues, category, difficulty: "medium" };
}

async function fetchClues(
  apiKey: string,
  slots: CrosswordSlot[],
  category: string
): Promise<ClueMap> {
  const wordList = slots
    .map((s) => `${s.answer} (${s.direction}, ${s.length} letters)`)
    .join("\n");

  const prompt =
    `You are writing clues for a newspaper crossword puzzle with a "${category}" theme.\n\n` +
    `For each word below, write ONE short crossword clue (5–10 words).\n` +
    `Rules:\n` +
    `- Clues must be fair — a solver who knows the answer should recognise it immediately\n` +
    `- Vary the style: some definitions, some wordplay, some fill-in-the-blank\n` +
    `- Do NOT include the answer word in the clue\n` +
    `- Theme the clue to "${category}" where natural, but don't force it\n\n` +
    `Words:\n${wordList}\n\n` +
    `Return ONLY a JSON object mapping each word to its clue. No preamble, no markdown:\n` +
    `{"WORD1":"clue one","WORD2":"clue two",...}`;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  const text = (data.content ?? [])
    .filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("");

  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) throw new Error("No JSON object found");
    return JSON.parse(text.slice(start, end + 1)) as ClueMap;
  } catch {
    console.error("[CrosswordIngest] Failed to parse clues JSON:", text.slice(0, 300));
    return {};
  }
}

// ─── DB storage ───────────────────────────────────────────────────────────────

async function storePuzzle(puzzle: CrosswordPuzzle): Promise<void> {
  const { error } = await db.from("games").insert({
    type: "crossword",
    difficulty: puzzle.difficulty,
    category: puzzle.category,
    payload: puzzle as unknown as Record<string, unknown>,
    used_count: 0,
  });

  if (error) throw new Error(`storePuzzle: ${error.message}`);
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
