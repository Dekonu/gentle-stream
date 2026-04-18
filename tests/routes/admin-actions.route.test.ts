import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const requireAdminMock = vi.fn();
const approveModeratedArticleMock = vi.fn();
const reviewSubmissionMock = vi.fn();

vi.mock("@/lib/api/adminAuth", () => ({
  requireAdmin: requireAdminMock,
}));

vi.mock("@/lib/db/articleModeration", () => ({
  approveModeratedArticle: approveModeratedArticleMock,
}));

vi.mock("@/lib/db/creator", () => ({
  reviewSubmission: reviewSubmissionMock,
}));

describe("/api/admin action routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 for moderation approve when admin check fails", async () => {
    const forbidden = NextResponse.json({ error: "forbidden" }, { status: 403 });
    requireAdminMock.mockResolvedValueOnce({ ok: false, response: forbidden });

    const { POST } = await import("@/app/api/admin/articles/moderation/[id]/approve/route");
    const request = new NextRequest(
      "http://localhost/api/admin/articles/moderation/article-1/approve",
      {
        method: "POST",
        body: JSON.stringify({ note: "ok" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const response = await POST(request, { params: Promise.resolve({ id: "article-1" }) });

    expect(response.status).toBe(403);
    expect(approveModeratedArticleMock).not.toHaveBeenCalled();
  });

  it("approves moderated article when admin check passes", async () => {
    requireAdminMock.mockResolvedValueOnce({ ok: true, userId: "admin-1" });
    approveModeratedArticleMock.mockResolvedValueOnce({
      articleId: "article-1",
      status: "approved",
    });

    const { POST } = await import("@/app/api/admin/articles/moderation/[id]/approve/route");
    const request = new NextRequest(
      "http://localhost/api/admin/articles/moderation/article-1/approve",
      {
        method: "POST",
        body: JSON.stringify({ note: "Looks good" }),
        headers: { "Content-Type": "application/json" },
      }
    );
    const response = await POST(request, { params: Promise.resolve({ id: "article-1" }) });

    expect(response.status).toBe(200);
    expect(approveModeratedArticleMock).toHaveBeenCalledWith({
      articleId: "article-1",
      reviewerUserId: "admin-1",
      note: "Looks good",
    });
  });

  it("rejects submission with sanitized reason", async () => {
    requireAdminMock.mockResolvedValueOnce({ ok: true, userId: "admin-2" });
    reviewSubmissionMock.mockResolvedValueOnce({ id: "sub-1", status: "rejected" });

    const { POST } = await import("@/app/api/admin/submissions/[id]/reject/route");
    const request = new NextRequest("http://localhost/api/admin/submissions/sub-1/reject", {
      method: "POST",
      body: JSON.stringify({
        adminNote: "Needs work",
        rejectionReason: "Insufficient sourcing",
      }),
      headers: { "Content-Type": "application/json" },
    });
    const response = await POST(request, { params: Promise.resolve({ id: "sub-1" }) });

    expect(response.status).toBe(200);
    expect(reviewSubmissionMock).toHaveBeenCalledWith({
      submissionId: "sub-1",
      reviewerUserId: "admin-2",
      action: "reject",
      adminNote: "Needs work",
      rejectionReason: "Insufficient sourcing",
    });
  });
});
