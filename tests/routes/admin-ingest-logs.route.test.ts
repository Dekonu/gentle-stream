import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const isAuthorizedCronRequestMock = vi.fn();

vi.mock("@/lib/cron/verifyRequest", () => ({
  isAuthorizedCronRequest: isAuthorizedCronRequestMock,
}));

vi.mock("@/lib/db/client", () => ({
  db: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        order: vi.fn(() => ({
          limit: vi.fn(),
        })),
      })),
    })),
  },
}));

describe("/api/admin/cron/ingest-logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when cron request is unauthorized", async () => {
    isAuthorizedCronRequestMock.mockReturnValueOnce(false);
    const { GET } = await import("@/app/api/admin/cron/ingest-logs/route");
    const request = new NextRequest("http://localhost/api/admin/cron/ingest-logs");

    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
