import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";
import type { UserGameStats } from "@/lib/types";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: rows, error } = await db
    .from("game_completions")
    .select("game_type, difficulty, duration_seconds, completed_at")
    .eq("user_id", userId)
    .order("completed_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const list = rows ?? [];
  const byType: UserGameStats["byType"] = {};
  let totalSeconds = 0;

  for (const r of list) {
    const gt = r.game_type as string;
    const ds = r.duration_seconds as number;
    totalSeconds += ds;
    if (!byType[gt]) {
      byType[gt] = { completions: 0, totalSeconds: 0, avgSeconds: 0 };
    }
    const b = byType[gt]!;
    b.completions += 1;
    b.totalSeconds += ds;
  }

  for (const k of Object.keys(byType)) {
    const b = byType[k]!;
    b.avgSeconds =
      b.completions > 0 ? Math.round(b.totalSeconds / b.completions) : 0;
  }

  const recent = list.slice(0, 8).map((r) => ({
    gameType: r.game_type as string,
    difficulty: r.difficulty as string,
    durationSeconds: r.duration_seconds as number,
    completedAt: r.completed_at as string,
  }));

  const stats: UserGameStats = {
    totalCompletions: list.length,
    totalSecondsPlayed: totalSeconds,
    byType,
    recent,
  };

  return NextResponse.json(stats);
}
