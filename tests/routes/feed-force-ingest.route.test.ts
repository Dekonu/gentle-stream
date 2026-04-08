import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const runIngestAgentMock = vi.fn();
const runTaggerAgentMock = vi.fn();
const getSessionUserIdMock = vi.fn();
const consumeRateLimitMock = vi.fn();

vi.mock("@/lib/agents/ingestAgent", () => ({
  runIngestAgent: runIngestAgentMock,
}));

vi.mock("@/lib/agents/taggerAgent", () => ({
  runTaggerAgent: runTaggerAgentMock,
}));

vi.mock("@/lib/api/sessionUser", () => ({
  getSessionUserId: getSessionUserIdMock,
}));

vi.mock("@/lib/security/rateLimit", () => ({
  buildRateLimitKey: vi.fn(() => "rate-key"),
  consumeRateLimit: consumeRateLimitMock,
  rateLimitExceededResponse: vi.fn(
    () => new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 })
  ),
}));

describe("/api/feed/force-ingest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env.AUTH_DISABLED = "0";
    process.env.DEV_LIGHT = "0";
    process.env.INGEST_DISCOVERY_PROVIDER = "rss_seeded_primary";
    getSessionUserIdMock.mockResolvedValue("user-1");
    runTaggerAgentMock.mockResolvedValue(undefined);
  });

  it("returns 409 when provider is not an RSS mode", async () => {
    process.env.INGEST_DISCOVERY_PROVIDER = "anthropic_web_search";
    const { POST } = await import("@/app/api/feed/force-ingest/route");
    const req = new NextRequest("http://localhost/api/feed/force-ingest", {
      method: "POST",
      body: JSON.stringify({ sectionIndex: 1 }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(409);
    expect(runIngestAgentMock).not.toHaveBeenCalled();
  });

  it("returns 429 when per-actor rate limit is exceeded", async () => {
    consumeRateLimitMock.mockResolvedValueOnce({
      allowed: false,
      remaining: 0,
      retryAfterSec: 55,
      resetAt: Date.now() + 55_000,
    });

    const { POST } = await import("@/app/api/feed/force-ingest/route");
    const req = new NextRequest("http://localhost/api/feed/force-ingest", {
      method: "POST",
      body: JSON.stringify({ sectionIndex: 2 }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(runIngestAgentMock).not.toHaveBeenCalled();
  });

  it("runs bounded ingest and returns success payload", async () => {
    consumeRateLimitMock.mockResolvedValue({
      allowed: true,
      remaining: 1,
      retryAfterSec: 0,
      resetAt: Date.now() + 30_000,
    });
    runIngestAgentMock.mockResolvedValueOnce({
      inserted: [{ id: "a1" }],
      attemptedCount: 3,
    });

    const { POST } = await import("@/app/api/feed/force-ingest/route");
    const req = new NextRequest("http://localhost/api/feed/force-ingest", {
      method: "POST",
      body: JSON.stringify({ sectionIndex: 0, category: "Health & Wellness" }),
      headers: { "content-type": "application/json", "accept-language": "en-US,en;q=0.9" },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      ok: true,
      ran: true,
      insertedCount: 1,
      provider: "rss_seeded_primary",
      category: "Health & Wellness",
    });
    expect(runIngestAgentMock).toHaveBeenCalledWith("Health & Wellness", 3, {
      pipeline: "overhaul",
      discoveryProvider: "rss_seeded_primary",
      targetLocale: "en-us",
    });
    expect(runTaggerAgentMock).toHaveBeenCalledWith(6);
  });
});
