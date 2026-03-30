import { NextRequest, NextResponse } from "next/server";
import { getSessionUserId } from "@/lib/api/sessionUser";
import { getOrCreateUserProfile } from "@/lib/db/users";
import { importRecipeFromUrl } from "@/lib/recipes/importer";

export const runtime = "nodejs";

function parseAllowlist(): string[] {
  const raw = process.env.RECIPE_IMPORT_ALLOWLIST ?? "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export async function POST(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profile = await getOrCreateUserProfile(userId);
  if (profile.userRole !== "creator") {
    return NextResponse.json({ error: "Creator access required" }, { status: 403 });
  }

  const allowlist = parseAllowlist();
  if (allowlist.length === 0) {
    return NextResponse.json(
      { error: "Recipe import is not configured. Missing RECIPE_IMPORT_ALLOWLIST." },
      { status: 503 }
    );
  }

  let body: { url?: unknown };
  try {
    body = (await request.json()) as { url?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.url !== "string" || !body.url.trim()) {
    return NextResponse.json({ error: "url is required." }, { status: 400 });
  }

  try {
    const recipe = await importRecipeFromUrl({
      url: body.url,
      allowlist,
      enableClaudeFallback:
        process.env.RECIPE_IMPORT_ENABLE_CLAUDE_FALLBACK === "1",
    });
    return NextResponse.json({ recipe });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown import error";
    const status =
      message.toLowerCase().includes("allowlist") ||
      message.toLowerCase().includes("private ip") ||
      message.toLowerCase().includes("http:// and https://")
        ? 400
        : message.toLowerCase().includes("403") ||
            message.toLowerCase().includes("blocked automated access")
          ? 422
        : message.toLowerCase().includes("could not confidently")
          ? 422
          : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

