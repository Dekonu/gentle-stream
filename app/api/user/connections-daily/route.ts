import { NextResponse } from "next/server";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";

/**
 * Whether the signed-in user has finished a Connections puzzle today (UTC calendar day).
 * Anonymous clients use localStorage for the same signal.
 */
export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ completedToday: false, authenticated: false });
  }

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);

  const { data, error } = await db
    .from("game_completions")
    .select("id")
    .eq("user_id", userId)
    .eq("game_type", "connections")
    .gte("completed_at", start.toISOString())
    .limit(1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    completedToday: (data?.length ?? 0) > 0,
    authenticated: true,
  });
}
