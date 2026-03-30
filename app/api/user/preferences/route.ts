/**
 * GET  /api/user/preferences  — current session user’s profile (requires cookie auth)
 * POST /api/user/preferences  — update allowed fields (currently `gameRatio` only)
 *
 * `userRole` is not writable from the client; promote creators in Supabase / admin only.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import {
  getOrCreateUserProfile,
  updateUserPreferences,
} from "@/lib/db/users";
import type { GameType } from "@/lib/games/types";

const preferencesBodySchema = z
  .object({
    gameRatio: z.number().min(0).max(1).optional(),
    enabledGameTypes: z.array(z.string()).min(1).optional(),
    themePreference: z.union([z.literal("light"), z.literal("dark"), z.null()]).optional(),
  })
  .strict();

export async function GET() {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await getOrCreateUserProfile(user.id);
    return NextResponse.json(profile);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedBody = preferencesBodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Invalid preferences payload." }, { status: 400 });
    }
    const body = parsedBody.data;

    const wantsGameRatio = body.gameRatio !== undefined;
    const wantsEnabledTypes = body.enabledGameTypes !== undefined;
    const wantsThemePreference = body.themePreference !== undefined;
    if (!wantsGameRatio && !wantsEnabledTypes && !wantsThemePreference) {
      return NextResponse.json(
        { error: "Provide gameRatio, enabledGameTypes, and/or themePreference" },
        { status: 400 }
      );
    }

    let gameRatio: number | undefined;
    if (wantsGameRatio) {
      if (
        typeof body.gameRatio !== "number" ||
        Number.isNaN(body.gameRatio) ||
        body.gameRatio < 0 ||
        body.gameRatio > 1
      ) {
        return NextResponse.json(
          { error: "gameRatio must be a number from 0 to 1" },
          { status: 400 }
        );
      }
      gameRatio = body.gameRatio;
    }

    let enabledGameTypes: GameType[] | undefined;
    if (wantsEnabledTypes) {
      if (!Array.isArray(body.enabledGameTypes)) {
        return NextResponse.json(
          { error: "enabledGameTypes must be an array of game type strings" },
          { status: 400 }
        );
      }
      enabledGameTypes = body.enabledGameTypes.filter(
        (v): v is GameType => typeof v === "string"
      ) as GameType[];
      if (enabledGameTypes.length === 0) {
        return NextResponse.json(
          { error: "Select at least one game type" },
          { status: 400 }
        );
      }
    }

    let themePreference: "light" | "dark" | null | undefined;
    if (wantsThemePreference) {
      if (body.themePreference == null) {
        themePreference = null;
      } else if (body.themePreference === "light" || body.themePreference === "dark") {
        themePreference = body.themePreference;
      } else {
        return NextResponse.json(
          { error: "themePreference must be one of: light, dark, null" },
          { status: 400 }
        );
      }
    }

    const updated = await updateUserPreferences(user.id, {
      ...(gameRatio !== undefined ? { gameRatio } : {}),
      ...(enabledGameTypes !== undefined ? { enabledGameTypes } : {}),
      ...(themePreference !== undefined ? { themePreference } : {}),
    });
    return NextResponse.json(updated);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
