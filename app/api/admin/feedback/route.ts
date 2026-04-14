import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api/adminAuth";
import { listSiteFeedbackForAdmin } from "@/lib/db/siteFeedback";

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.ok) return admin.response;

  const limit = parseInt(new URL(request.url).searchParams.get("limit") ?? "100", 10);
  const items = await listSiteFeedbackForAdmin(Number.isFinite(limit) ? limit : 100);
  return NextResponse.json({ items });
}
