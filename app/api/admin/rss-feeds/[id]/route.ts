import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { deleteRssFeed, updateRssFeed } from "@/lib/db/rssFeeds";
import { parseJsonBody } from "@/lib/validation/http";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const patchFeedSchema = z.object({
  feedUrl: z.string().url().optional(),
  publisher: z.string().max(160).optional(),
  label: z.string().max(160).optional(),
  categoryHint: z.string().max(120).optional(),
  localeHint: z.string().max(48).optional(),
  isEnabled: z.boolean().optional(),
  toneRiskScore: z.number().int().min(0).max(10).optional(),
});

async function assertAdmin(request: NextRequest): Promise<
  { ok: true } | { ok: false; response: NextResponse }
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      ok: false,
      response: apiErrorResponse({
        request,
        status: 401,
        code: API_ERROR_CODES.UNAUTHORIZED,
        message: "Unauthorized",
      }),
    };
  }
  if (!isAdmin({ userId: user.id, email: user.email ?? null })) {
    return {
      ok: false,
      response: apiErrorResponse({
        request,
        status: 403,
        code: API_ERROR_CODES.FORBIDDEN,
        message: "Admin access required",
      }),
    };
  }
  return { ok: true };
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await assertAdmin(request);
  if (!admin.ok) return admin.response;
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success)
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Invalid RSS feed id",
    });

  const parsed = await parseJsonBody({
    request,
    schema: patchFeedSchema,
  });
  if (!parsed.ok) return parsed.response;
  try {
    const updated = await updateRssFeed(params.data.id, parsed.data);
    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not update RSS feed";
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message,
    });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = await assertAdmin(request);
  if (!admin.ok) return admin.response;
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success)
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message: "Invalid RSS feed id",
    });
  try {
    await deleteRssFeed(params.data.id);
    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not delete RSS feed";
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.INVALID_REQUEST,
      message,
    });
  }
}

