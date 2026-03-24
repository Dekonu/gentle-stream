/**
 * lib/db/games/games.ts
 *
 * Database helpers for the games table.
 * Used by game ingest agents (write) and game API routes (read).
 */

import { db } from "../client";
import type { CrosswordPuzzle } from "@/lib/games/crosswordIngestAgent";
import type { ConnectionsPuzzle } from "@/lib/games/connectionsIngestAgent";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameRow {
  id: string;
  type: string;
  difficulty: string;
  category: string | null;
  payload: unknown;
  used_count: number;
  created_at: string;
}

// ─── Read ─────────────────────────────────────────────────────────────────────

function pickRowPreferringLowUse(
  rows: GameRow[],
  randomTieBreak: boolean
): GameRow {
  const minUse = Math.min(...rows.map((r) => r.used_count ?? 0));
  const tied = rows.filter((r) => (r.used_count ?? 0) === minUse);
  if (!randomTieBreak || tied.length <= 1) return tied[0]!;
  return tied[Math.floor(Math.random() * tied.length)]!;
}

/**
 * Fetch one unused (or least-used) puzzle of a given type from the pool.
 * Prefers puzzles that match the given category, falls back to any category.
 * Returns null if the pool is empty.
 *
 * `randomTieBreak`: when several rows share the lowest `used_count`, pick one at
 * random so the same crossword is not always served first (helps variety and load spread).
 */
export async function getGameFromPool(
  type: string,
  category?: string,
  options?: { randomTieBreak?: boolean }
): Promise<GameRow | null> {
  const randomTieBreak = options?.randomTieBreak === true;
  const batchLimit = randomTieBreak ? 40 : 1;

  // Try category match first
  if (category) {
    const { data: catRows } = await db
      .from("games")
      .select("*")
      .eq("type", type)
      .eq("category", category)
      .order("used_count", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(batchLimit);
    if (catRows?.length) {
      return pickRowPreferringLowUse(catRows as GameRow[], randomTieBreak);
    }
  }

  // Fall back to any category
  const { data: rows, error } = await db
    .from("games")
    .select("*")
    .eq("type", type)
    .order("used_count", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(batchLimit);

  if (error || !rows?.length) return null;
  return pickRowPreferringLowUse(rows as GameRow[], randomTieBreak);
}

/**
 * Increment used_count for a game after it's been served.
 * Non-fatal on failure — we'd rather serve a duplicate than error.
 */
export async function markGameUsed(id: string): Promise<void> {
  const rpcAttempt = await db
    .from("games")
    .update({ used_count: db.rpc("increment_used_count_game", { p_id: id }) as never })
    .eq("id", id);

  if (!rpcAttempt.error) return;

  const { data } = await db
    .from("games")
    .select("used_count")
    .eq("id", id)
    .single();
  if (data) {
    await db
      .from("games")
      .update({ used_count: (data.used_count ?? 0) + 1 })
      .eq("id", id);
  }
}

/** Count available puzzles of a given type in the pool */
export async function countGamePool(type: string): Promise<number> {
  const { count, error } = await db
    .from("games")
    .select("*", { count: "exact", head: true })
    .eq("type", type);
  if (error) return 0;
  return count ?? 0;
}

// ─── Typed accessors ──────────────────────────────────────────────────────────

export async function getCrosswordFromPool(
  category?: string
): Promise<CrosswordPuzzle | null> {
  const row = await getGameFromPool("crossword", category, {
    randomTieBreak: true,
  });
  if (!row) return null;
  void markGameUsed(row.id); // fire-and-forget
  return row.payload as CrosswordPuzzle;
}

export async function getConnectionsFromPool(
  category?: string
): Promise<ConnectionsPuzzle | null> {
  const row = await getGameFromPool("connections", category, {
    randomTieBreak: true,
  });
  if (!row) return null;
  void markGameUsed(row.id);
  return row.payload as ConnectionsPuzzle;
}
