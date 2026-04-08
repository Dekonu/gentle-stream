import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CATEGORIES } from "@gentle-stream/domain/constants";
import type { Category } from "@gentle-stream/domain/constants";
import { runIngestAgent } from "@/lib/agents/ingestAgent";
import { runTaggerAgent } from "@/lib/agents/taggerAgent";
import {
  resolveIngestDiscoveryProvider,
  type IngestDiscoveryProvider,
} from "@/lib/agents/ingestDiscoveryProvider";
import { getSessionUserId } from "@/lib/api/sessionUser";
import {
  buildRateLimitKey,
  consumeRateLimit,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import { captureException, captureMessage } from "@/lib/observability";

const FORCE_INGEST_COUNT = 3;
const MANUAL_DISCOVERY_PROVIDER_DEFAULT: IngestDiscoveryProvider = "rss_seeded_primary";

const bodySchema = z.object({
  sectionIndex: z.number().int().min(0),
  category: z.string().trim().optional(),
});

function resolveDiscoveryProvider(): IngestDiscoveryProvider {
  const configured = process.env.INGEST_DISCOVERY_PROVIDER ?? MANUAL_DISCOVERY_PROVIDER_DEFAULT;
  return resolveIngestDiscoveryProvider(configured);
}

function resolveCategory(inputCategory: string | undefined, sectionIndex: number): Category {
  if (inputCategory && CATEGORIES.includes(inputCategory as Category)) return inputCategory as Category;
  return CATEGORIES[sectionIndex % CATEGORIES.length] as Category;
}

function isRssDiscoveryProvider(provider: IngestDiscoveryProvider): boolean {
  return provider === "rss_seed_only" || provider === "rss_seeded_primary";
}

function resolveTargetLocale(request: NextRequest): string | undefined {
  const raw = request.headers.get("accept-language");
  if (!raw) return undefined;
  const [preferred] = raw.split(",");
  const normalized = preferred?.trim().toLowerCase();
  if (!normalized) return undefined;
  return normalized.slice(0, 24);
}

function shouldDisableForceIngestForDevLight(): boolean {
  const value = process.env.DEV_LIGHT?.trim().toLowerCase();
  return value === "1" || value === "true";
}

export async function POST(request: NextRequest) {
  const traceId = request.headers.get("x-trace-id") ?? undefined;
  const startedAt = Date.now();

  let parsedBody: z.infer<typeof bodySchema>;
  try {
    const body = (await request.json()) as unknown;
    parsedBody = bodySchema.parse(body);
  } catch {
    return apiErrorResponse({
      request,
      traceId,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Invalid force-ingest payload.",
      details: { expected: "{ sectionIndex: number, category?: string }" },
    });
  }

  const category = resolveCategory(parsedBody.category, parsedBody.sectionIndex);
  const provider = resolveDiscoveryProvider();
  if (!isRssDiscoveryProvider(provider) || shouldDisableForceIngestForDevLight()) {
    captureMessage({
      level: "info",
      message: "forceIngestSkippedNonRssProvider",
      context: { provider, category, traceId },
    });
    return NextResponse.json(
      {
        ok: false,
        ran: false,
        reason: shouldDisableForceIngestForDevLight()
          ? "dev_light_disabled"
          : "provider_not_rss_mode",
        provider,
        category,
      },
      { status: 409 }
    );
  }

  const isAuthDisabled = process.env.AUTH_DISABLED === "1";
  const sessionUserId = isAuthDisabled ? null : await getSessionUserId();
  const actorUserId = isAuthDisabled ? process.env.DEV_USER_ID ?? "dev-local" : sessionUserId;
  const actorKey = buildRateLimitKey({
    request,
    userId: actorUserId,
    routeId: "api-feed-force-ingest-actor",
  });

  const actorLimit = await consumeRateLimit({
    policy: { id: "feed-force-ingest-user", windowMs: 5 * 60_000, max: 2 },
    key: actorKey,
  });
  if (!actorLimit.allowed) {
    captureMessage({
      level: "warning",
      message: "forceIngestRateLimited",
      context: {
        policyId: "feed-force-ingest-user",
        retryAfterSec: actorLimit.retryAfterSec,
        provider,
        category,
        traceId,
      },
    });
    return rateLimitExceededResponse(actorLimit, request);
  }

  const categoryLimit = await consumeRateLimit({
    policy: { id: "feed-force-ingest-category", windowMs: 2 * 60_000, max: 1 },
    key: `api-feed-force-ingest:category:${category}`,
  });
  if (!categoryLimit.allowed) {
    captureMessage({
      level: "warning",
      message: "forceIngestRateLimited",
      context: {
        policyId: "feed-force-ingest-category",
        retryAfterSec: categoryLimit.retryAfterSec,
        provider,
        category,
        traceId,
      },
    });
    return rateLimitExceededResponse(categoryLimit, request);
  }

  const globalLimit = await consumeRateLimit({
    policy: { id: "feed-force-ingest-global", windowMs: 5 * 60_000, max: 60 },
    key: "api-feed-force-ingest:global",
  });
  if (!globalLimit.allowed) {
    captureMessage({
      level: "warning",
      message: "forceIngestRateLimited",
      context: {
        policyId: "feed-force-ingest-global",
        retryAfterSec: globalLimit.retryAfterSec,
        provider,
        category,
        traceId,
      },
    });
    return rateLimitExceededResponse(globalLimit, request);
  }

  captureMessage({
    level: "info",
    message: "forceIngestRequested",
    context: { provider, category, traceId },
  });

  const targetLocale = resolveTargetLocale(request);
  try {
    const ingestCount = Math.min(Math.max(FORCE_INGEST_COUNT, 1), 3);
    const result = await runIngestAgent(category, ingestCount, {
      pipeline: "overhaul",
      discoveryProvider: provider,
      targetLocale,
    });
    const insertedCount = result.inserted.length;
    const durationMs = Date.now() - startedAt;

    // Best-effort tagger; do not block the response path.
    void runTaggerAgent(Math.min(10, ingestCount + 3)).catch((error) => {
      captureException(error, {
        route: "api.feed.force-ingest",
        phase: "tagger",
        category,
        provider,
        traceId,
      });
    });

    captureMessage({
      level: "info",
      message: "forceIngestExecuted",
      context: {
        provider,
        category,
        insertedCount,
        attemptedCount: result.attemptedCount,
        durationMs,
        traceId,
      },
    });

    return NextResponse.json({
      ok: true,
      ran: true,
      queued: false,
      provider,
      category,
      insertedCount,
      attemptedCount: result.attemptedCount,
      rateLimited: false,
      reason: insertedCount > 0 ? "inserted" : "no_new_candidates",
      durationMs,
    });
  } catch (error: unknown) {
    captureException(error, {
      route: "api.feed.force-ingest",
      phase: "run_ingest",
      category,
      provider,
      traceId,
    });
    return apiErrorResponse({
      request,
      traceId,
      status: 500,
      code: API_ERROR_CODES.INTERNAL,
      message: "Could not trigger force ingest right now.",
      details: { provider, category },
    });
  }
}
