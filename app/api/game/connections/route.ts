/**
 * GET /api/game/connections?category=...
 *
 * Serves a Connections puzzle from the pre-generated pool.
 * Falls back to live generation (~12–20s, 3-4 API calls) if pool is empty.
 *
 * Unlike the algorithmic games, there is no instant live fallback here —
 * Connections requires multiple API calls. If the pool is empty the client
 * gets a loading state while generation runs. The cron keeps the pool full.
 */

import { NextRequest, NextResponse } from "next/server";
import { getGameFromPool, markGameUsed } from "@/lib/db/games";
import {
  runConnectionsIngest,
  type ConnectionsPuzzle,
} from "@/lib/games/connectionsIngestAgent";
import type { Category } from "@/lib/constants";
import { CATEGORIES } from "@/lib/constants";

export const maxDuration = 60; // Vercel max for hobby plan

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const rawCategory = searchParams.get("category") ?? undefined;
  const category = rawCategory && CATEGORIES.includes(rawCategory as Category)
    ? rawCategory
    : undefined;

  // ── 1. Try pool ─────────────────────────────────────────────────────────────
  try {
    const row = await getGameFromPool("connections", category);
    if (row) {
      void markGameUsed(row.id);
      return NextResponse.json({ ...(row.payload as ConnectionsPuzzle), fromPool: true });
    }
  } catch (e) {
    console.warn("[/api/game/connections] Pool fetch failed:", e);
  }

  // ── 2. Live generation fallback ─────────────────────────────────────────────
  console.log(`[/api/game/connections] Pool empty — generating live`);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Pool empty and ANTHROPIC_API_KEY not set" },
      { status: 503 }
    );
  }

  try {
    const targetCategory = (category ?? "Science & Discovery") as Category;
    const inserted = await runConnectionsIngest(targetCategory);

    if (inserted === 0) {
      return NextResponse.json(
        { error: "Generation failed — please try again" },
        { status: 500 }
      );
    }

    // Fetch the freshly generated puzzle
    const row = await getGameFromPool("connections", category);
    if (!row) {
      return NextResponse.json({ error: "Generation succeeded but fetch failed" }, { status: 500 });
    }

    void markGameUsed(row.id);
    return NextResponse.json({ ...(row.payload as ConnectionsPuzzle), fromPool: false });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
