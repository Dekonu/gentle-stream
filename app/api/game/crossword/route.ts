/**
 * GET /api/game/crossword?category=...
 *
 * Serves a crossword puzzle. Attempts to pull from the pre-generated pool
 * first (instant). Falls back to live generation (~5–8s) if the pool is empty.
 *
 * The live fallback is acceptable for a passion project / early prod — as the
 * pool fills up over time (cron runs every 2h), live generation becomes rare.
 */

import { NextRequest, NextResponse } from "next/server";
import { getCrosswordFromPool } from "@/lib/db/games";
import {
  fillCrosswordGrid,
  type CrosswordSlot,
} from "@/lib/games/crosswordGridFiller";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category") ?? undefined;

  // ── 1. Try pool first ──────────────────────────────────────────────────────
  try {
    const poolPuzzle = await getCrosswordFromPool(category);
    if (poolPuzzle) {
      return NextResponse.json({ ...poolPuzzle, fromPool: true });
    }
  } catch (e) {
    console.warn("[/api/game/crossword] Pool fetch failed:", e);
  }

  // ── 2. Live fallback ───────────────────────────────────────────────────────
  console.log(`[/api/game/crossword] Pool empty — generating live for "${category}"`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Pool empty and ANTHROPIC_API_KEY not set" },
      { status: 503 }
    );
  }

  const filled = fillCrosswordGrid(category);
  if (!filled) {
    return NextResponse.json({ error: "Grid generation failed" }, { status: 500 });
  }

  const { grid, slots } = filled;

  // Get clues from Claude
  const wordList = slots
    .map((s) => `${s.answer} (${s.direction}, ${s.length} letters)`)
    .join("\n");

  const prompt =
    `Write crossword clues for a "${category ?? "general knowledge"}" themed puzzle.\n` +
    `For each word, write ONE short clue (5–10 words). No answer in clue. No preamble.\n` +
    `Return ONLY JSON: {"WORD":"clue",...}\n\nWords:\n${wordList}`;

  try {
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

    if (!res.ok) throw new Error(`Claude API ${res.status}`);

    const data = await res.json();
    const text = (data.content ?? [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("");

    let clueMap: Record<string, string> = {};
    try {
      const start = text.indexOf("{");
      const end = text.lastIndexOf("}");
      if (start !== -1 && end !== -1) {
        clueMap = JSON.parse(text.slice(start, end + 1));
      }
    } catch { /* use fallback hints below */ }

    const slotsWithClues = slots.map((slot) => ({
      ...slot,
      clue: clueMap[slot.answer] ?? `${slot.answer.toLowerCase()} (${slot.length} letters)`,
    }));

    return NextResponse.json({
      grid,
      slots: slotsWithClues,
      category: category ?? "General",
      difficulty: "medium",
      fromPool: false,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Generation failed" },
      { status: 500 }
    );
  }
}
