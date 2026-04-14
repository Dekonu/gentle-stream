import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/adminAuth";
import { listSubmissionsForAdmin } from "@/lib/db/creator";
import type { ArticleSubmissionStatus } from "@/lib/types";

function parseStatus(value: string | null): ArticleSubmissionStatus | undefined {
  if (
    value === "pending" ||
    value === "changes_requested" ||
    value === "approved" ||
    value === "rejected" ||
    value === "withdrawn"
  ) {
    return value;
  }
  return undefined;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const status = parseStatus(new URL(request.url).searchParams.get("status"));
  const submissions = await listSubmissionsForAdmin(status);
  return NextResponse.json({ submissions });
}
