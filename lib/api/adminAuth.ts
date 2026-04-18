import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/auth/admin";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";

interface RequireAdminSuccess {
  ok: true;
  userId: string;
}

interface RequireAdminFailure {
  ok: false;
  response: NextResponse;
}

export type RequireAdminResult = RequireAdminSuccess | RequireAdminFailure;

export async function requireAdmin(request: NextRequest): Promise<RequireAdminResult> {
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

  return { ok: true, userId: user.id };
}
