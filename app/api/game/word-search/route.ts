/**
 * GET /api/game/word-search?difficulty=easy|medium|hard&category=...
 *
 * Generates a fresh word search puzzle server-side and returns it as JSON.
 * No DB read — pure algorithmic generation (<5ms).
 * The category param is used to pick a thematic word bank matching the
 * surrounding article feed section.
 */

import { NextRequest, NextResponse } from "next/server";
import { generateWordSearch } from "@/lib/games/wordSearchGenerator";
import type { Difficulty } from "@/lib/games/types";

const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const rawDiff = searchParams.get("difficulty") ?? "medium";
  const category = searchParams.get("category") ?? undefined;

  const difficulty = VALID_DIFFICULTIES.includes(rawDiff as Difficulty)
    ? (rawDiff as Difficulty)
    : "medium";

  try {
    const puzzle = generateWordSearch(difficulty, category);
    return NextResponse.json(puzzle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
