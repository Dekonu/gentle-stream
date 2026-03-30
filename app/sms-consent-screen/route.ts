import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";

export async function GET() {
  const imagePath = path.join(process.cwd(), "public", "sms-consent-screen.png");

  try {
    const bytes = await readFile(imagePath);

    return new NextResponse(bytes, {
      headers: {
        "Content-Type": "image/png",
        // Avoid serving an outdated image to third-party validators (e.g. Twilio).
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "sms-consent-screen.png not found" }, { status: 404 });
  }
}

export async function HEAD() {
  const imagePath = path.join(process.cwd(), "public", "sms-consent-screen.png");

  try {
    const bytes = await readFile(imagePath);

    return new NextResponse(null, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
        "Content-Length": String(bytes.byteLength),
      },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

