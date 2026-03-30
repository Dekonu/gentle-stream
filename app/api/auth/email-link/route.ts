import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import {
  buildRateLimitKey,
  consumeRateLimit,
  getClientIp,
  rateLimitExceededResponse,
} from "@/lib/security/rateLimit";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { hasTrustedOrigin } from "@/lib/security/origin";
import { parseJsonBody } from "@/lib/validation/http";

const emailLinkBodySchema = z.object({
  email: z.string().trim().email(),
  redirectTo: z.string().trim().url(),
  turnstileToken: z.string().trim().min(1),
});

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function allowedAuthOrigins(request: NextRequest): Set<string> {
  const origins = new Set<string>();
  try {
    origins.add(new URL(request.url).origin);
  } catch {
    // ignore malformed request URL
  }

  const envOrigin = process.env.NEXT_PUBLIC_AUTH_REDIRECT_ORIGIN?.trim();
  if (envOrigin) {
    try {
      origins.add(new URL(envOrigin).origin);
    } catch {
      // ignore malformed env value
    }
  }
  return origins;
}

function isAllowedRedirectTo(request: NextRequest, redirectTo: string): boolean {
  try {
    const parsed = new URL(redirectTo);
    return allowedAuthOrigins(request).has(parsed.origin);
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!hasTrustedOrigin(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const ipLimit = await consumeRateLimit({
    policy: { id: "auth-email-link-ip", windowMs: 10 * 60 * 1000, max: 16 },
    key: buildRateLimitKey({ request, routeId: "auth-email-link" }),
  });
  if (!ipLimit.allowed) return rateLimitExceededResponse(ipLimit);

  const parsedBody = await parseJsonBody({
    request,
    schema: emailLinkBodySchema,
  });
  if (!parsedBody.ok) return parsedBody.response;
  const email = parsedBody.data.email.trim().toLowerCase();
  const redirectTo = parsedBody.data.redirectTo.trim();
  const turnstileToken = parsedBody.data.turnstileToken.trim();

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }
  if (!redirectTo || !isAllowedRedirectTo(request, redirectTo)) {
    return NextResponse.json({ error: "Invalid auth redirect URL." }, { status: 400 });
  }

  const emailLimit = await consumeRateLimit({
    policy: { id: "auth-email-link-email", windowMs: 10 * 60 * 1000, max: 6 },
    key: `email:${email}`,
  });
  if (!emailLimit.allowed) return rateLimitExceededResponse(emailLimit);

  const captcha = await verifyTurnstileToken({
    token: turnstileToken,
    remoteIp: getClientIp(request),
  });
  if (!captcha.success) {
    return NextResponse.json({ error: captcha.error }, { status: 400 });
  }

  const supabase = createPublicServerClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) {
    return NextResponse.json(
      { error: "Could not send sign-in link right now." },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
