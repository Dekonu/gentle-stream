/**
 * GET /api/game/sudoku?difficulty=easy|medium|hard
 *
 * Generates a fresh Sudoku puzzle server-side and returns it as JSON.
 * No DB read — pure algorithmic generation (~1–5ms).
 * The solution is included in the response (validated client-side on completion).
 */

import { NextRequest, NextResponse } from "next/server";
import { generateSudoku } from "@/lib/games/sudokuGenerator";
import type { Difficulty } from "@/lib/games/types";

const VALID_DIFFICULTIES: Difficulty[] = ["easy", "medium", "hard"];

export async function GET(request: NextRequest) {
  const diff = (request.nextUrl.searchParams.get("difficulty") ?? "medium") as Difficulty;
  const difficulty = VALID_DIFFICULTIES.includes(diff) ? diff : "medium";

  try {
    const puzzle = generateSudoku(difficulty);
    return NextResponse.json(puzzle);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
