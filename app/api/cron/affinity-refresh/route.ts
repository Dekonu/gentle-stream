import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron/verifyRequest";
import { db } from "@/lib/db/client";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import { captureException, flushOnShutdown, startSpan } from "@/lib/observability";

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  const limitParam = Number(new URL(request.url).searchParams.get("limit") ?? DEFAULT_LIMIT);
  const limit = Number.isFinite(limitParam)
    ? Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limitParam)))
    : DEFAULT_LIMIT;

  const sinceIso = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const span = startSpan("cron.affinity_refresh", {
    traceId: request.headers.get("x-trace-id") ?? undefined,
    sinceIso,
  });
  const { data, error } = await db
    .from("article_engagement_events")
    .select("user_id,occurred_at")
    .gte("occurred_at", sinceIso)
    .order("occurred_at", { ascending: false })
    .limit(limit * 4);

  if (error) {
    captureException(error, {
      route: "cron.affinity_refresh",
      phase: "load_users",
      sinceIso,
    });
    span.end({ ok: false, phase: "load_users" });
    await flushOnShutdown();
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: `Could not load engagement users: ${error.message}`,
    });
  }

  const distinctUserIds = Array.from(
    new Set((data ?? []).map((row) => row.user_id as string).filter(Boolean))
  ).slice(0, limit);

  const RPC_CHUNK = 16;
  let refreshed = 0;
  let failed = 0;
  for (let i = 0; i < distinctUserIds.length; i += RPC_CHUNK) {
    const chunk = distinctUserIds.slice(i, i + RPC_CHUNK);
    const outcomes = await Promise.all(
      chunk.map(async (userId) => {
        const { error: refreshError } = await db.rpc("refresh_user_article_affinity", {
          p_user_id: userId,
        });
        return { userId, refreshError };
      })
    );
    for (const { userId, refreshError } of outcomes) {
      if (refreshError) {
        failed += 1;
        captureException(refreshError, {
          route: "cron.affinity_refresh",
          userId,
          phase: "refresh_user_affinity",
        });
        console.error("[affinity-refresh] refresh_user_article_affinity failed", {
          userId,
          message: refreshError.message,
        });
        continue;
      }
      refreshed += 1;
    }
  }

  span.end({
    ok: failed === 0,
    checkedUsers: distinctUserIds.length,
    refreshed,
    failed,
  });
  await flushOnShutdown();

  return NextResponse.json({
    ok: failed === 0,
    checkedUsers: distinctUserIds.length,
    refreshed,
    failed,
    sinceIso,
  });
}
