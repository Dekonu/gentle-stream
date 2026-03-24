/**
 * GET /api/cron/games
 *
 * Cron job: top up the crossword puzzle pool.
 * Runs every 2 hours via vercel.json.
 * Only generates new puzzles if the pool is below MIN_CROSSWORD_POOL.
 *
 * Requires x-cron-secret header matching CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { runCrosswordIngest, MIN_CROSSWORD_POOL, getCrosswordPoolSize } from "@/lib/games/crosswordIngestAgent";

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const poolSize = await getCrosswordPoolSize();
    console.log(`[/api/cron/games] Current crossword pool: ${poolSize}`);

    if (poolSize >= MIN_CROSSWORD_POOL) {
      return NextResponse.json({
        message: `Pool sufficient (${poolSize} puzzles). No generation needed.`,
        poolSize,
      });
    }

    console.log(`[/api/cron/games] Pool below threshold — generating crosswords`);
    const inserted = await runCrosswordIngest();

    return NextResponse.json({
      message: `Generated ${inserted} new crossword(s).`,
      poolSize: poolSize + inserted,
      inserted,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/cron/games]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
