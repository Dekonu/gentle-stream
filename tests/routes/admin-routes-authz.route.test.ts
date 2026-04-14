import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAdminMock = vi.fn();
const listArticlesForModerationMock = vi.fn();
const listSubmissionsForAdminMock = vi.fn();

vi.mock("@/lib/api/adminAuth", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/db/articleModeration", () => ({
  listArticlesForModeration: listArticlesForModerationMock,
}));

vi.mock("@/lib/db/creator", () => ({
  listSubmissionsForAdmin: listSubmissionsForAdminMock,
}));

describe("/api/admin route authz", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns requireAdmin response when unauthorized for moderation list", async () => {
    const unauthorized = NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    requireAdminMock.mockResolvedValueOnce({ ok: false, response: unauthorized });

    const { GET } = await import("@/app/api/admin/articles/moderation/route");
    const request = new NextRequest("http://localhost/api/admin/articles/moderation");

    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(listArticlesForModerationMock).not.toHaveBeenCalled();
  });

  it("returns moderation items when admin access succeeds", async () => {
    const items = [{ id: "a1", status: "pending" }];
    requireAdminMock.mockResolvedValueOnce({ ok: true, userId: "admin-1" });
    listArticlesForModerationMock.mockResolvedValueOnce(items);

    const { GET } = await import("@/app/api/admin/articles/moderation/route");
    const request = new NextRequest(
      "http://localhost/api/admin/articles/moderation?status=pending&limit=5"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(listArticlesForModerationMock).toHaveBeenCalledWith({
      filter: "pending",
      limit: 5,
    });
    await expect(response.json()).resolves.toEqual({ items });
  });

  it("returns submissions when admin access succeeds", async () => {
    const submissions = [{ id: "s1", status: "pending" }];
    requireAdminMock.mockResolvedValueOnce({ ok: true, userId: "admin-1" });
    listSubmissionsForAdminMock.mockResolvedValueOnce(submissions);

    const { GET } = await import("@/app/api/admin/submissions/route");
    const request = new NextRequest(
      "http://localhost/api/admin/submissions?status=changes_requested"
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(listSubmissionsForAdminMock).toHaveBeenCalledWith("changes_requested");
    await expect(response.json()).resolves.toEqual({ submissions });
  });
});
