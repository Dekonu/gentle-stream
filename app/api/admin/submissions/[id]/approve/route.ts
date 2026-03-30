import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { reviewSubmission } from "@/lib/db/creator";
import { parseJsonBody } from "@/lib/validation/http";

// Client sends null for empty fields (JSON), not omitted keys — use nullish, not optional-only.
const approveBodySchema = z.object({
  adminNote: z.string().max(500).nullish(),
  rejectionReason: z.string().nullish(),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isAdmin({ userId: user.id, email: user.email ?? null })) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const parsedBody = await parseJsonBody({
    request,
    schema: approveBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;
  const body = parsedBody.data;
  const adminNote =
    typeof body.adminNote === "string" && body.adminNote.trim()
      ? body.adminNote.trim().slice(0, 500)
      : null;

  try {
    const reviewed = await reviewSubmission({
      submissionId: params.id,
      reviewerUserId: user.id,
      action: "approve",
      adminNote,
      rejectionReason: null,
    });
    return NextResponse.json(reviewed);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = message.includes("pending")
      ? 409
      : message.includes("not found")
        ? 404
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
