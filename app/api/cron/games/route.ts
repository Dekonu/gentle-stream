/**
 * GET /api/cron/games
 *
 * Tops up both the crossword and connections puzzle pools.
 * Runs every 2 hours via vercel.json.
 * Only generates what's needed — skips if pool is already healthy.
 *
 * Requires x-cron-secret header matching CRON_SECRET env var.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  runCrosswordIngest,
  MIN_CROSSWORD_POOL,
  getCrosswordPoolSize,
} from "@/lib/games/crosswordIngestAgent";
import {
  runConnectionsIngest,
  MIN_CONNECTIONS_POOL,
  getConnectionsPoolSize,
} from "@/lib/games/connectionsIngestAgent";

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  // ── Crossword ────────────────────────────────────────────────────────────────
  try {
    const crosswordPool = await getCrosswordPoolSize();
    if (crosswordPool < MIN_CROSSWORD_POOL) {
      console.log(`[/api/cron/games] Crossword pool low (${crosswordPool}) — generating`);
      const inserted = await runCrosswordIngest();
      results.crossword = { poolBefore: crosswordPool, inserted };
    } else {
      results.crossword = { poolSize: crosswordPool, skipped: true };
    }
  } catch (e) {
    results.crossword = { error: e instanceof Error ? e.message : "failed" };
  }

  // ── Connections ───────────────────────────────────────────────────────────────
  try {
    const connectionsPool = await getConnectionsPoolSize();
    if (connectionsPool < MIN_CONNECTIONS_POOL) {
      console.log(`[/api/cron/games] Connections pool low (${connectionsPool}) — generating`);
      const inserted = await runConnectionsIngest();
      results.connections = { poolBefore: connectionsPool, inserted };
    } else {
      results.connections = { poolSize: connectionsPool, skipped: true };
    }
  } catch (e) {
    results.connections = { error: e instanceof Error ? e.message : "failed" };
  }

  return NextResponse.json({ message: "Games cron complete", results });
}
