/**
 * GET /api/game/crossword?category=...
 *
 * Serves a crossword puzzle. Tries the DB pool first, then builds a grid locally
 * and attaches clues from Claude when the API is available. If the pool is empty
 * and Claude errors (rate limit, bad key, model, network), we still return 200
 * with mechanical placeholder clues so the game always loads.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCrosswordFromPool } from "@/lib/db/games";
import {
  buildCluePromptBlock,
  canonicalizeClueKeys,
  clueForSlot,
} from "@/lib/games/crosswordClueMerge";
import {
  fillCrosswordGrid,
  type CrosswordSlot,
} from "@/lib/games/crosswordGridFiller";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

type SlotWithClue = CrosswordSlot & { clue: string };

function mechanicalClue(slot: CrosswordSlot): string {
  return `Definition needed (${slot.length} letters)`;
}

function clueLeaksAnswer(slot: CrosswordSlot, clue: string): boolean {
  const answer = slot.answer.toLowerCase();
  return clue.toLowerCase().includes(answer);
}

function slotsWithClues(
  slots: CrosswordSlot[],
  clueMap: Record<string, string>
): SlotWithClue[] {
  return slots.map((slot) => ({
    ...slot,
    clue: clueForSlot(slot, clueMap, mechanicalClue),
  }));
}

/** Ensure every slot has a clue string (older pool rows may omit it). */
function normalizePoolPayload(puzzle: {
  grid: string[][];
  slots: (CrosswordSlot & { clue?: string })[];
  category: string;
  difficulty: "medium";
}): Record<string, unknown> {
  return {
    ...puzzle,
    slots: puzzle.slots.map((s) => ({
      ...s,
      clue:
        typeof s.clue === "string" &&
        s.clue.trim() &&
        !clueLeaksAnswer(s, s.clue)
          ? s.clue
          : mechanicalClue(s),
    })),
    fromPool: true,
  };
}

async function fetchClueMapFromClaude(
  apiKey: string,
  category: string | undefined,
  slots: CrosswordSlot[]
): Promise<Record<string, string>> {
  const wordList = buildCluePromptBlock(slots);

  const prompt =
    `Write crossword clues for a "${category ?? "general knowledge"}" themed puzzle.\n` +
    `For each ENTRY below, write ONE short clue (5–10 words). Do not put the solution in the clue. No preamble.\n` +
    `Entries are numbered by grid label (e.g. 1-across and 1-down are different clues even when the answer word is the same).\n` +
    `Return ONLY JSON with keys exactly like "1-across", "1-down", "2-down", etc.:\n` +
    `{"1-across":"...","1-down":"...",...}\n\nEntries:\n${wordList}`;

  const model =
    process.env.ANTHROPIC_CROSSWORD_MODEL?.trim() ||
    "claude-sonnet-4-20250514";

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.warn(
      `[/api/game/crossword] Claude HTTP ${res.status}:`,
      body.slice(0, 400)
    );
    return {};
  }

  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
  };
  const text = (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");

  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1) {
      const parsed = JSON.parse(text.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
      const strMap: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") strMap[k] = v;
      }
      return canonicalizeClueKeys(strMap);
    }
  } catch {
    console.warn(
      "[/api/game/crossword] Could not parse clues JSON:",
      text.slice(0, 200)
    );
  }
  return {};
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category") ?? undefined;
  const categoryLabel = category ?? "General";

  try {
    const poolPuzzle = await getCrosswordFromPool(category);
    if (
      poolPuzzle &&
      Array.isArray(poolPuzzle.grid) &&
      Array.isArray(poolPuzzle.slots) &&
      poolPuzzle.slots.length > 0
    ) {
      return NextResponse.json(normalizePoolPayload(poolPuzzle));
    }
  } catch (e) {
    console.warn("[/api/game/crossword] Pool fetch failed:", e);
  }

  console.log(
    `[/api/game/crossword] Pool empty — live grid for "${category ?? "general"}"`
  );

  const filled = fillCrosswordGrid(category);
  if (!filled) {
    return NextResponse.json(
      { error: "Grid generation failed" },
      { status: 500 }
    );
  }

  const { grid, slots } = filled;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();

  let clueMap: Record<string, string> = {};
  if (apiKey) {
    try {
      clueMap = await fetchClueMapFromClaude(apiKey, category, slots);
    } catch (e) {
      console.warn("[/api/game/crossword] Claude request error:", e);
    }
  } else {
    console.warn(
      "[/api/game/crossword] ANTHROPIC_API_KEY not set — using mechanical clues"
    );
  }

  const hadAiClues = Object.keys(clueMap).length > 0;

  return NextResponse.json({
    grid,
    slots: slotsWithClues(slots, clueMap),
    category: categoryLabel,
    difficulty: "medium" as const,
    fromPool: false,
    cluesFromAi: hadAiClues,
  });
}
