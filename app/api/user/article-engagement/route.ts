import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { getSessionUserId } from "@/lib/api/sessionUser";
import type { ArticleEngagementBatchRequest } from "@/lib/engagement/types";
import {
  ARTICLE_ENGAGEMENT_MAX_EVENTS_PER_REQUEST,
  type NormalizedEngagementRow,
  parseEngagementBatch,
} from "@/lib/engagement/contract";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

async function filterRowsByExistingArticles(
  rows: NormalizedEngagementRow[]
): Promise<NormalizedEngagementRow[]> {
  const articleIds = Array.from(new Set(rows.map((row) => row.article_id)));
  if (articleIds.length === 0) return [];
  const { data, error } = await db
    .from("articles")
    .select("id")
    .in("id", articleIds);
  if (error) throw new Error(`filterRowsByExistingArticles: ${error.message}`);
  const existingIds = new Set((data ?? []).map((row) => String((row as { id: string }).id)));
  return rows.filter((row) => existingIds.has(row.article_id));
}

/**
 * Engagement tracking is now rolled out to 100% of authenticated users.
 */
export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return apiErrorResponse({
      request,
      status: 403,
      code: API_ERROR_CODES.FORBIDDEN_ORIGIN,
      message: "Invalid request origin.",
    });
  }

  const userId = await getSessionUserId();
  if (!userId) {
    return apiErrorResponse({
      request,
      status: 401,
      code: API_ERROR_CODES.UNAUTHORIZED,
      message: "Unauthorized",
    });
  }

  const rateLimit = await consumeRateLimit({
    policy: { id: "article-engagement", windowMs: 60_000, max: 180 },
    key: buildRateLimitKey({
      request,
      userId,
      routeId: "api-user-article-engagement",
    }),
  });
  if (!rateLimit.allowed) return rateLimitExceededResponse(rateLimit, request);

  const parsedBody = await parseJsonBody({
    request,
    schema: z.object({
      events: z
        .array(z.unknown())
        .min(1)
        .max(ARTICLE_ENGAGEMENT_MAX_EVENTS_PER_REQUEST),
    }),
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data as ArticleEngagementBatchRequest;

  const parsed = parseEngagementBatch(body, userId);
  if (parsed.error) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: parsed.error,
    });
  }

  const validRows = await filterRowsByExistingArticles(parsed.rows);
  if (validRows.length === 0) {
    return NextResponse.json({
      ok: true,
      accepted: 0,
      droppedMissingArticleCount: parsed.rows.length,
    });
  }

  const { error } = await db.from("article_engagement_events").insert(validRows);
  if (error) {
    return apiErrorResponse({
      request,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: "Could not record engagement right now.",
    });
  }

  return NextResponse.json({
    ok: true,
    accepted: validRows.length,
    droppedMissingArticleCount: parsed.rows.length - validRows.length,
  });
}

