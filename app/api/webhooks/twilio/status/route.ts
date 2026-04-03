import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

interface TwilioStatusPayload {
  MessageSid?: string;
  MessageStatus?: string;
  ErrorCode?: string;
  ErrorMessage?: string;
  To?: string;
  From?: string;
  AccountSid?: string;
}

function isAuthorizedWebhook(request: NextRequest): boolean {
  const configured = process.env.TWILIO_WEBHOOK_TOKEN?.trim();
  if (!configured) return true;
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  return token.length > 0 && token === configured;
}

function expectedTwilioSignature(
  url: string,
  form: FormData,
  authToken: string
): string {
  const entries: Array<[string, string]> = [];
  for (const [key, value] of form.entries()) {
    if (typeof value !== "string") continue;
    entries.push([key, value]);
  }

  entries.sort((a, b) => {
    const keyCompare = a[0].localeCompare(b[0]);
    if (keyCompare !== 0) return keyCompare;
    return a[1].localeCompare(b[1]);
  });

  const payload = url + entries.map(([k, v]) => `${k}${v}`).join("");
  return crypto.createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function hasValidTwilioSignature(request: NextRequest, form: FormData): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim() ?? "";
  if (!authToken) return true;
  const provided = request.headers.get("x-twilio-signature")?.trim() ?? "";
  if (!provided) return false;
  const expected = expectedTwilioSignature(request.url, form, authToken);
  return safeEqual(provided, expected);
}

function parseStatusPayload(form: FormData): TwilioStatusPayload {
  function read(name: string): string | undefined {
    const v = form.get(name);
    return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
  }

  return {
    MessageSid: read("MessageSid"),
    MessageStatus: read("MessageStatus"),
    ErrorCode: read("ErrorCode"),
    ErrorMessage: read("ErrorMessage"),
    To: read("To"),
    From: read("From"),
    AccountSid: read("AccountSid"),
  };
}

/**
 * Twilio Messaging status callback endpoint.
 * Configure this URL in your Twilio Messaging Service "Status Callback URL".
 *
 * Twilio posts application/x-www-form-urlencoded. We log minimal status details
 * so OTP deliverability issues are diagnosable when Supabase phone auth appears stuck.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedWebhook(request)) {
    return NextResponse.json({ error: "Unauthorized webhook request." }, { status: 401 });
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return NextResponse.json(
      { error: "Expected form-encoded Twilio status payload." },
      { status: 400 }
    );
  }

  const form = await request.formData();
  if (!hasValidTwilioSignature(request, form)) {
    return NextResponse.json({ error: "Invalid Twilio signature." }, { status: 401 });
  }
  const payload = parseStatusPayload(form);

  console.info("[twilio-status-callback]", {
    messageSid: payload.MessageSid ?? null,
    status: payload.MessageStatus ?? null,
    errorCode: payload.ErrorCode ?? null,
    hasErrorMessage: Boolean(payload.ErrorMessage),
    to: payload.To ?? null,
    from: payload.From ?? null,
  });

  return new NextResponse(null, { status: 204 });
}

/**
 * Optional probe endpoint for quick setup checks in browser/curl.
 */
export async function GET(request: NextRequest) {
  if (!isAuthorizedWebhook(request)) {
    return NextResponse.json({ error: "Unauthorized webhook request." }, { status: 401 });
  }
  return NextResponse.json({ ok: true, endpoint: "twilio-status-callback" });
}

