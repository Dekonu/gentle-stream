/**
 * lib/db/games.ts
 *
 * Database helpers for the games table.
 * Used by game ingest agents (write) and game API routes (read).
 */

import { db } from "./client";
import type { CrosswordPuzzle } from "../games/crosswordIngestAgent";

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

/**
 * Fetch one unused (or least-used) puzzle of a given type from the pool.
 * Prefers puzzles that match the given category, falls back to any category.
 * Returns null if the pool is empty.
 */
export async function getGameFromPool(
  type: string,
  category?: string
): Promise<GameRow | null> {
  // Try category match first
  if (category) {
    const { data } = await db
      .from("games")
      .select("*")
      .eq("type", type)
      .eq("category", category)
      .order("used_count", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1)
      .single();
    if (data) return data as GameRow;
  }

  // Fall back to any category
  const { data, error } = await db
    .from("games")
    .select("*")
    .eq("type", type)
    .order("used_count", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(1)
    .single();

  if (error || !data) return null;
  return data as GameRow;
}

/**
 * Increment used_count for a game after it's been served.
 * Non-fatal on failure — we'd rather serve a duplicate than error.
 */
export async function markGameUsed(id: string): Promise<void> {
  await db
    .from("games")
    .update({ used_count: db.rpc("increment_used_count_game", { p_id: id }) as never })
    .eq("id", id)
    .catch(async () => {
      // Fallback: read-increment-write
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
    });
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
  const row = await getGameFromPool("crossword", category);
  if (!row) return null;
  void markGameUsed(row.id); // fire-and-forget
  return row.payload as CrosswordPuzzle;
}
