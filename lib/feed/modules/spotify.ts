import type { SpotifyMoodTileData, SpotifyMoodTrack } from "@/lib/types";

const SPOTIFY_ACCOUNTS_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE = "https://api.spotify.com/v1";
const TOKEN_SKEW_MS = 30_000;
const TILE_CACHE_TTL_MS = 10 * 60 * 1000;

interface SpotifyTokenCache {
  accessToken: string;
  expiresAt: number;
}

interface TileCacheEntry {
  data: SpotifyMoodTileData;
  expiresAt: number;
}

let tokenCache: SpotifyTokenCache | null = null;
const tileCache = new Map<string, TileCacheEntry>();

const CATEGORY_MOOD_MAP: Record<string, string[]> = {
  world: ["cinematic", "uplifting"],
  science: ["focus", "ambient"],
  tech: ["synthwave", "focus"],
  health: ["calm", "peaceful"],
  travel: ["wanderlust", "chill"],
  culture: ["indie", "soulful"],
  sports: ["energetic", "hype"],
  games: ["electronic", "adventure"],
};

function randomFrom<T>(values: T[]): T {
  const idx = Math.floor(Math.random() * values.length);
  return values[idx]!;
}

function normalizeMoodList(value: string | undefined): string[] {
  if (!value) return ["chill", "focus", "uplifting"];
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function pickMood(input: { category?: string | null; mood?: string | null }): string {
  const explicitMood = (input.mood ?? "").trim();
  if (explicitMood.length > 0) return explicitMood;
  const categoryKey = (input.category ?? "").trim().toLowerCase();
  const categoryMoods = CATEGORY_MOOD_MAP[categoryKey];
  if (categoryMoods && categoryMoods.length > 0) return randomFrom(categoryMoods);
  const defaults = normalizeMoodList(process.env.SPOTIFY_MODULE_DEFAULT_MOODS);
  return randomFrom(defaults);
}

function normalizeMarket(input: string | null | undefined): string {
  const market = (input ?? process.env.SPOTIFY_MODULE_MARKET ?? "US").trim().toUpperCase();
  return market.length === 2 ? market : "US";
}

function getFallbackTile(input: {
  mood: string;
  market: string;
  reason?: string;
}): SpotifyMoodTileData {
  return {
    mode: "fallback",
    title: "Mood Tile",
    subtitle:
      input.reason ??
      "Spotify data is unavailable right now. Try again in a moment.",
    mood: input.mood,
    market: input.market,
    tracks: [],
  };
}

function toTrack(item: {
  id: string;
  name: string;
  preview_url?: string | null;
  external_urls?: { spotify?: string };
  artists?: Array<{ name?: string }>;
  album?: { images?: Array<{ url?: string }> };
}): SpotifyMoodTrack | null {
  const url = item.external_urls?.spotify;
  if (!item.id || !item.name || !url) return null;
  const artist =
    item.artists?.map((entry) => entry.name?.trim()).filter(Boolean).join(", ") ||
    "Unknown artist";
  return {
    id: item.id,
    name: item.name,
    artist,
    spotifyUrl: url,
    previewUrl: item.preview_url ?? null,
    albumImageUrl: item.album?.images?.[0]?.url,
  };
}

async function fetchSpotifyToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + TOKEN_SKEW_MS) {
    return tokenCache.accessToken;
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Spotify credentials are not configured.");

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({ grant_type: "client_credentials" });
  const res = await fetch(SPOTIFY_ACCOUNTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status}).`);

  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token || !json.expires_in) {
    throw new Error("Spotify token response was invalid.");
  }

  tokenCache = {
    accessToken: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return json.access_token;
}

async function fetchMoodTracks(input: {
  accessToken: string;
  mood: string;
  market: string;
}): Promise<SpotifyMoodTrack[]> {
  const params = new URLSearchParams({
    q: `${input.mood} mood`,
    type: "track",
    market: input.market,
    limit: "8",
  });
  const res = await fetch(`${SPOTIFY_API_BASE}/search?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${input.accessToken}`,
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Spotify search failed (${res.status}).`);
  const json = (await res.json()) as {
    tracks?: {
      items?: Array<{
        id: string;
        name: string;
        preview_url?: string | null;
        external_urls?: { spotify?: string };
        artists?: Array<{ name?: string }>;
        album?: { images?: Array<{ url?: string }> };
      }>;
    };
  };
  const items = json.tracks?.items ?? [];
  return items.map(toTrack).filter((entry): entry is SpotifyMoodTrack => entry != null);
}

export async function getSpotifyMoodTileData(input: {
  category?: string | null;
  mood?: string | null;
  market?: string | null;
}): Promise<SpotifyMoodTileData> {
  const enabledRaw = process.env.SPOTIFY_MODULE_ENABLED?.trim().toLowerCase();
  const isEnabled =
    enabledRaw == null ||
    enabledRaw === "" ||
    enabledRaw === "1" ||
    enabledRaw === "true" ||
    enabledRaw === "yes";
  const mood = pickMood({ category: input.category, mood: input.mood });
  const market = normalizeMarket(input.market);
  const cacheKey = `${mood}|${market}`;
  const now = Date.now();
  const cached = tileCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.data;

  if (!isEnabled) {
    return getFallbackTile({
      mood,
      market,
      reason: "Spotify module is disabled by configuration.",
    });
  }

  try {
    const accessToken = await fetchSpotifyToken();
    const tracks = await fetchMoodTracks({ accessToken, mood, market });
    if (tracks.length === 0) {
      return getFallbackTile({
        mood,
        market,
        reason: "No tracks available for this mood right now.",
      });
    }
    const top = tracks[0];
    const data: SpotifyMoodTileData = {
      mode: "spotify",
      title: "Mood Tile",
      subtitle: `A ${mood} playlist pulse for your stream.`,
      mood,
      market,
      tracks,
      playlistUrl: top?.spotifyUrl,
      imageUrl: top?.albumImageUrl,
    };
    tileCache.set(cacheKey, {
      data,
      expiresAt: now + TILE_CACHE_TTL_MS,
    });
    return data;
  } catch {
    const fallback = getFallbackTile({ mood, market });
    tileCache.set(cacheKey, {
      data: fallback,
      expiresAt: now + TILE_CACHE_TTL_MS,
    });
    return fallback;
  }
}
