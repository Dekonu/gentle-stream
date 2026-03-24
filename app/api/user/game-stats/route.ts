import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { getUserGameStats } from "@/lib/db/gameStats";

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = request.nextUrl.searchParams.get("recent");
  const recentLimit = raw ? parseInt(raw, 10) : 8;
  const safe = Number.isFinite(recentLimit) ? recentLimit : 8;

  try {
    const stats = await getUserGameStats(userId, safe);
    return NextResponse.json(stats);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
