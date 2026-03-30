import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { parseJsonBody, parseQuery } from "@/lib/validation/http";

const GAME_TYPES = new Set([
  "sudoku",
  "word_search",
  "killer_sudoku",
  "nonogram",
]);
const DIFFS = new Set(["easy", "medium", "hard"]);
const gameTypeEnum = z.enum(["sudoku", "word_search", "killer_sudoku", "nonogram"]);
const difficultyEnum = z.enum(["easy", "medium", "hard"]);
const gameTypeQuerySchema = z.object({ gameType: gameTypeEnum });
const putBodySchema = z.object({
  gameType: gameTypeEnum,
  difficulty: difficultyEnum,
  elapsedSeconds: z.number().min(0).optional(),
  gameState: z.record(z.string(), z.unknown()),
});

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedQuery = parseQuery({
    query: Object.fromEntries(request.nextUrl.searchParams.entries()),
    schema: gameTypeQuerySchema,
  });
  if (!parsedQuery.ok) return parsedQuery.response;
  const gameType = parsedQuery.data.gameType;

  const { data, error } = await db
    .from("game_saves")
    .select("*")
    .eq("user_id", userId)
    .eq("game_type", gameType)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? null);
}

export async function PUT(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedBody = await parseJsonBody({
    request,
    schema: putBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;

  const elapsed =
    typeof body.elapsedSeconds === "number" && body.elapsedSeconds >= 0
      ? Math.floor(body.elapsedSeconds)
      : 0;

  const { error } = await db.from("game_saves").upsert(
    {
      user_id: userId,
      game_type: body.gameType,
      difficulty: body.difficulty,
      elapsed_seconds: elapsed,
      game_state: body.gameState,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,game_type" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedQuery = parseQuery({
    query: Object.fromEntries(request.nextUrl.searchParams.entries()),
    schema: gameTypeQuerySchema,
  });
  if (!parsedQuery.ok) return parsedQuery.response;
  const gameType = parsedQuery.data.gameType;

  const { error } = await db
    .from("game_saves")
    .delete()
    .eq("user_id", userId)
    .eq("game_type", gameType);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
