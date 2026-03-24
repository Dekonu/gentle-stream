/**
 * GET /api/cron/games
 *
 * Cron job: top up precomputed games (blocked 7×7 crosswords + word pool).
 * Runs every 2 hours via vercel.json.
 * Crosswords cap at MAX_CROSSWORDS_IN_POOL (demo limit).
 *
 * Requires x-cron-secret header matching CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import { MIN_WORD_POOL_TOTAL, getWordPoolTotalCount } from "@/lib/db/gameWordPool";
import { getCrosswordPoolSize } from "@/lib/games/crosswordIngestAgent";
import {
  runBlockedCrosswordIngest,
  MAX_CROSSWORDS_IN_POOL,
} from "@/lib/games/blockedCrosswordIngestAgent";
import {
  runWordSearchPoolIngest,
  shouldRunWordPoolIngest,
} from "@/lib/games/wordSearchPoolIngestAgent";

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const crosswordPool = await getCrosswordPoolSize();
    const wordPool = await getWordPoolTotalCount();
    console.log(
      `[/api/cron/games] crossword pool: ${crosswordPool}, word pool rows: ${wordPool}`
    );

    let crosswordsInserted = 0;
    let wordRowsInserted = 0;

    if (crosswordPool < MAX_CROSSWORDS_IN_POOL) {
      console.log(
        `[/api/cron/games] Crossword pool ${crosswordPool}/${MAX_CROSSWORDS_IN_POOL} — blocked ingest`
      );
      crosswordsInserted = await runBlockedCrosswordIngest();
    }

    if (await shouldRunWordPoolIngest()) {
      console.log(
        `[/api/cron/games] Word pool below ${MIN_WORD_POOL_TOTAL} — ingesting via agent`
      );
      wordRowsInserted = await runWordSearchPoolIngest();
    }

    const crosswordPoolAfter = await getCrosswordPoolSize();
    const wordPoolAfter = await getWordPoolTotalCount();

    return NextResponse.json({
      message: "Games cron completed.",
      crosswordPoolBefore: crosswordPool,
      crosswordPoolAfter,
      wordPoolBefore: wordPool,
      wordPoolAfter,
      crosswordsInserted,
      wordRowsInserted,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/cron/games]", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
