import { db } from "./client";
import type { UserGameStats } from "../types";

/**
 * Load aggregated game metrics for a user (used by `/api/user/game-stats` and `/me/game-stats`).
 */
export async function getUserGameStats(
  userId: string,
  recentLimit: number
): Promise<UserGameStats> {
  const cappedRecent = Math.min(100, Math.max(1, Math.floor(recentLimit)));

  const [countRes, aggRes, recentRes] = await Promise.all([
    db
      .from("game_completions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId),
    db
      .from("game_completions")
      .select("game_type, difficulty, duration_seconds")
      .eq("user_id", userId),
    db
      .from("game_completions")
      .select("game_type, difficulty, duration_seconds, completed_at")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(cappedRecent),
  ]);

  if (countRes.error) throw new Error(countRes.error.message);
  if (aggRes.error) throw new Error(aggRes.error.message);
  if (recentRes.error) throw new Error(recentRes.error.message);

  const list = aggRes.data ?? [];
  const byType: UserGameStats["byType"] = {};
  const byTypeAndDifficulty: UserGameStats["byTypeAndDifficulty"] = {};
  let totalSeconds = 0;

  for (const r of list) {
    const gt = r.game_type as string;
    const diff = String(r.difficulty ?? "unknown");
    const ds = r.duration_seconds as number;
    totalSeconds += ds;

    if (!byType[gt]) {
      byType[gt] = { completions: 0, totalSeconds: 0, avgSeconds: 0 };
    }
    const bt = byType[gt]!;
    bt.completions += 1;
    bt.totalSeconds += ds;

    if (!byTypeAndDifficulty[gt]) byTypeAndDifficulty[gt] = {};
    if (!byTypeAndDifficulty[gt][diff]) {
      byTypeAndDifficulty[gt][diff] = {
        completions: 0,
        totalSeconds: 0,
        avgSeconds: 0,
      };
    }
    const cell = byTypeAndDifficulty[gt][diff]!;
    cell.completions += 1;
    cell.totalSeconds += ds;
  }

  for (const k of Object.keys(byType)) {
    const b = byType[k]!;
    b.avgSeconds =
      b.completions > 0 ? Math.round(b.totalSeconds / b.completions) : 0;
  }

  for (const gt of Object.keys(byTypeAndDifficulty)) {
    const row = byTypeAndDifficulty[gt]!;
    for (const d of Object.keys(row)) {
      const c = row[d]!;
      c.avgSeconds =
        c.completions > 0 ? Math.round(c.totalSeconds / c.completions) : 0;
    }
  }

  const recentRows = recentRes.data ?? [];
  const recent = recentRows.map((r) => ({
    gameType: r.game_type as string,
    difficulty: r.difficulty as string,
    durationSeconds: r.duration_seconds as number,
    completedAt: r.completed_at as string,
  }));

  return {
    totalCompletions: countRes.count ?? list.length,
    totalSecondsPlayed: totalSeconds,
    byType,
    byTypeAndDifficulty,
    recent,
  };
}
