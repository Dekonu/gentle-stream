"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Masthead, { MASTHEAD_TOP_BAR_HEIGHT_PX } from "./Masthead";
import { ProfileMenu } from "./user/ProfileMenu";
import CategoryDrawer from "./CategoryDrawer";
import { MfaChallengeGate } from "./auth/mfa/MfaChallengeGate";
import NewsSection from "./NewsSection";
import GameSlot from "./games/GameSlot";
import WeatherFillerCard from "./feed/WeatherFillerCard";
import SpotifyMoodTile from "./feed/SpotifyMoodTile";
import LoadingSection from "./LoadingSection";
import ErrorBanner from "./ErrorBanner";
import type { Category } from "@/lib/constants";
import type {
  Article,
  ArticleContentKind,
  FeedSection,
  ArticleFeedSection,
  GameFeedSection,
  ModuleFeedSection,
  FeedModuleData,
  WeatherModuleData,
  SpotifyMoodTileData,
} from "@/lib/types";
import { DEFAULT_GAME_RATIO } from "@/lib/constants";
import { feedGamePickForOrdinal } from "@/lib/games/feedPick";
import type { GameType } from "@/lib/games/types";
import { chooseNewspaperLayout } from "@/lib/feed/newspaperLayout";

// Strip any <cite ...>...</cite> or bare </cite> tags that leak from Claude
function stripCiteTags(text: string): string {
  return text
    .replace(/<cite[^>]*>/gi, "")
    .replace(/<\/cite>/gi, "")
    .trim();
}

function cleanArticle(article: Article): Article {
  return {
    ...article,
    body: stripCiteTags(article.body ?? ""),
    pullQuote: stripCiteTags(article.pullQuote ?? ""),
    subheadline: stripCiteTags(article.subheadline ?? ""),
    headline: stripCiteTags(article.headline ?? ""),
    sourceUrls: article.sourceUrls ?? [],
  };
}

function articleUniqKey(article: Article): string {
  if ("id" in article && typeof article.id === "string" && article.id.length > 0) {
    return `id:${article.id}`;
  }
  // Fallback for raw shapes: deterministic enough to avoid visible duplicates.
  return `raw:${article.category}|${article.headline}|${article.byline}|${article.location}`;
}

/**
 * Decide whether a given section index should be a game slot.
 * Deterministic: same sectionIndex always produces the same result for a given ratio.
 */
function shouldBeGame(sectionIndex: number, gameRatio: number): boolean {
  if (gameRatio <= 0) return false;
  if (gameRatio >= 1) return true;
  const period = Math.round(1 / gameRatio);
  return sectionIndex % period === period - 1;
}

const FEED_FETCH_TIMEOUT_MS = 90_000;
const SENTINEL_PREFETCH_PX = 900;
const MIN_LOAD_GAP_MS = 650;
const REACHED_END_COOLDOWN_MS = 20_000;
const DEFAULT_GAP_MIN_PX = 180;
const DEFAULT_FILLER_INTERVAL = 4;
const DEFAULT_WEATHER_WEIGHT = 3;
const DEFAULT_SPOTIFY_WEIGHT = 1;
type FeedKindFilter = "all" | ArticleContentKind;

function readTruthyFlag(input: string | undefined, defaultValue: boolean): boolean {
  if (input == null) return defaultValue;
  const value = input.trim().toLowerCase();
  if (value === "1" || value === "true" || value === "yes" || value === "on") return true;
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;
  return defaultValue;
}

function readPositiveInt(input: string | undefined, defaultValue: number): number {
  if (!input) return defaultValue;
  const parsed = Number.parseInt(input, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

export interface NewsFeedProps {
  /** Stable id from Supabase `auth.users` — used for ranking, seen state, future metrics. */
  userId: string;
  userEmail?: string | null;
  isAdmin?: boolean;
}

export default function NewsFeed({ userId, userEmail, isAdmin = false }: NewsFeedProps) {
  const [mfaPassed, setMfaPassed] = useState(userId === "dev-local");
  const [sections, setSections] = useState<FeedSection[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<Category | null>(null);
  const [activeKindFilter, setActiveKindFilter] = useState<FeedKindFilter>("all");
  const [liveGenerating, setLiveGenerating] = useState(false);
  /** True once game ratio is resolved for the current session/user bootstrap. */
  const [isFeedReady, setIsFeedReady] = useState(false);

  // Use refs for values that loadMore closes over — avoids stale closure bugs
  const loadingRef = useRef(false);
  const sectionCountRef = useRef(0);
  /** Counts game sections only — drives fair rotation in feedGamePickForOrdinal. */
  const gameSlotOrdinalRef = useRef(0);
  const activeCategoryRef = useRef<Category | null>(null);
  const activeKindFilterRef = useRef<FeedKindFilter>("all");
  /** Bumps on each [userId] bootstrap so Strict Mode / fast remounts only run one initial loadMore. */
  const feedBootstrapGenRef = useRef(0);
  const gameRatioRef = useRef(DEFAULT_GAME_RATIO);
  const enabledGameTypesRef = useRef<GameType[] | null>(null);
  const feedReadyRef = useRef(false);
  const lastArticleCategoryRef = useRef<string | undefined>(undefined);
  // Hard de-dup across all rendered sections in this session/category view.
  const renderedArticleKeysRef = useRef<Set<string>>(new Set());
  // Plain UUID IDs only — sent to /api/feed excludeIds for DB-level exclusion.
  const renderedDbArticleIdsRef = useRef<Set<string>>(new Set());

  // Prevent repeated loads when we have reached the end for this session/view.
  const reachedEndRef = useRef(false);
  // If the sentinel comes into view while we're loading, remember that so we can
  // fetch again immediately after the current request finishes.
  const pendingLoadRef = useRef(false);
  const lastLoadStartAtRef = useRef(0);
  const reachedEndTimeoutIdRef = useRef<number | null>(null);
  const minGapRetryTimeoutIdRef = useRef<number | null>(null);
  const articleSectionsRenderedRef = useRef(0);
  const fillerMetricsRef = useRef({
    gapDetected: 0,
    moduleInserted: 0,
    weatherInserted: 0,
    spotifyInserted: 0,
    artFallbackUsed: 0,
  });
  const browserGeoRef = useRef<{ lat: number; lon: number } | null>(null);
  const browserGeoAttemptedRef = useRef(false);

  const fillerEnabled = readTruthyFlag(
    process.env.NEXT_PUBLIC_FEED_GAP_FILL_ENABLED,
    true
  );
  const fillerGapMinPx = readPositiveInt(
    process.env.NEXT_PUBLIC_FEED_GAP_MIN_PX,
    DEFAULT_GAP_MIN_PX
  );
  const fillerInterval = readPositiveInt(
    process.env.NEXT_PUBLIC_FEED_FILLER_INTERVAL,
    DEFAULT_FILLER_INTERVAL
  );
  const spotifyModuleEnabled = readTruthyFlag(
    process.env.NEXT_PUBLIC_SPOTIFY_MODULE_ENABLED,
    true
  );
  const weatherWeight = readPositiveInt(
    process.env.NEXT_PUBLIC_WEATHER_MODULE_WEIGHT,
    DEFAULT_WEATHER_WEIGHT
  );
  const spotifyWeight = readPositiveInt(
    process.env.NEXT_PUBLIC_SPOTIFY_MODULE_WEIGHT,
    DEFAULT_SPOTIFY_WEIGHT
  );

  // Sentinel ref — plain IntersectionObserver (no library dependency on stale state)
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const resolveBrowserGeo = useCallback(async (): Promise<{ lat: number; lon: number } | null> => {
    if (browserGeoRef.current) return browserGeoRef.current;
    try {
      const stored = localStorage.getItem("gentle_stream_browser_geo");
      if (stored) {
        const parsed = JSON.parse(stored) as { lat?: unknown; lon?: unknown };
        if (typeof parsed.lat === "number" && typeof parsed.lon === "number") {
          browserGeoRef.current = { lat: parsed.lat, lon: parsed.lon };
          return browserGeoRef.current;
        }
      }
    } catch {
      /* ignore malformed cache */
    }

    if (browserGeoAttemptedRef.current) return null;
    browserGeoAttemptedRef.current = true;
    if (typeof navigator === "undefined" || !navigator.geolocation) return null;

    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = {
            lat: position.coords.latitude,
            lon: position.coords.longitude,
          };
          browserGeoRef.current = coords;
          try {
            localStorage.setItem("gentle_stream_browser_geo", JSON.stringify(coords));
          } catch {
            /* ignore storage write failures */
          }
          resolve(coords);
        },
        () => resolve(null),
        {
          enableHighAccuracy: false,
          timeout: 5_000,
          maximumAge: 15 * 60 * 1000,
        }
      );
    });
  }, []);

  const fetchModuleSection = useCallback(
    async (input: {
      index: number;
      reason: "gap" | "interval";
      category?: string;
      location?: string;
      moduleType: "weather" | "spotify";
    }): Promise<ModuleFeedSection | null> => {
      try {
        const params = new URLSearchParams();
        if (input.category) params.set("category", input.category);
        if (input.location) params.set("location", input.location);
        const browserCoords = await resolveBrowserGeo();
        if (browserCoords) {
          params.set("lat", String(browserCoords.lat));
          params.set("lon", String(browserCoords.lon));
        }
        const path =
          input.moduleType === "spotify"
            ? "/api/feed/modules/spotify"
            : "/api/feed/modules/weather";
        const res = await fetch(`${path}?${params.toString()}`, {
          cache: "no-store",
        });
        if (!res.ok) return null;
        const body = (await res.json()) as { data?: FeedModuleData };
        if (!body.data) return null;
        return {
          sectionType: "module",
          moduleType: input.moduleType,
          fillerType: input.moduleType,
          reason: input.reason,
          index: input.index,
          data: body.data,
        };
      } catch {
        return null;
      }
    },
    [resolveBrowserGeo]
  );

  const chooseModuleTypeForInsertion = useCallback(
    (seed: number): "weather" | "spotify" => {
      if (!spotifyModuleEnabled) return "weather";
      const weightedSum = weatherWeight + spotifyWeight;
      const bucket = Math.abs(seed % weightedSum);
      return bucket < weatherWeight ? "weather" : "spotify";
    },
    [spotifyModuleEnabled, spotifyWeight, weatherWeight]
  );

  const loadMore = useCallback(async (overrideCategory?: Category | null) => {
    if (!feedReadyRef.current) return;
    if (reachedEndRef.current) return;
    if (loadingRef.current) {
      pendingLoadRef.current = true;
      return;
    }

    const now = Date.now();
    const gapMs = now - lastLoadStartAtRef.current;
    if (gapMs < MIN_LOAD_GAP_MS) {
      pendingLoadRef.current = true;
      if (minGapRetryTimeoutIdRef.current != null) return;
      const waitMs = Math.max(MIN_LOAD_GAP_MS - gapMs + 25, 25);
      minGapRetryTimeoutIdRef.current = window.setTimeout(() => {
        minGapRetryTimeoutIdRef.current = null;
        if (loadingRef.current || reachedEndRef.current || !feedReadyRef.current) return;
        void loadMore(overrideCategory);
      }, waitMs);
      return;
    }
    lastLoadStartAtRef.current = now;

    loadingRef.current = true;
    setLoading(true);
    setError(null);

    const category =
      overrideCategory !== undefined
        ? overrideCategory
        : activeCategoryRef.current;
      const kindFilter = activeKindFilterRef.current;

    const currentIndex = sectionCountRef.current;

    try {
      // ── Decide: game slot or article section? ────────────────────────────────
      if (shouldBeGame(currentIndex, gameRatioRef.current)) {
        let gameType: GameFeedSection["gameType"];
        let difficulty: GameFeedSection["difficulty"];
        const enabled = enabledGameTypesRef.current ?? [];
        const pick = feedGamePickForOrdinal(gameSlotOrdinalRef.current++, enabled);
        gameType = pick.gameType;
        difficulty = pick.difficulty;

        const gameSection: GameFeedSection = {
          sectionType: "game",
          gameType,
          difficulty,
          index: currentIndex,
        };
        setSections((prev) => [...prev, gameSection]);
        sectionCountRef.current += 1;
        return;
      }

      // ── Article section ──────────────────────────────────────────────────────
      const params = new URLSearchParams();
      params.set("sectionIndex", String(currentIndex));
      if (category) params.set("category", category);
      if (kindFilter !== "all") params.set("contentKind", kindFilter);
      const excludeIds = Array.from(renderedDbArticleIdsRef.current).slice(-400);
      if (excludeIds.length > 0) params.set("excludeIds", excludeIds.join(","));

      const controller = new AbortController();
      const timeoutId = window.setTimeout(
        () => controller.abort(),
        FEED_FETCH_TIMEOUT_MS
      );

      let res: Response;
      try {
        res = await fetch(`/api/feed?${params.toString()}`, {
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeoutId);
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      const data: {
        articles: Article[];
        category: string;
        fromCache: boolean;
      } = await res.json();

      setLiveGenerating(!data.fromCache);

      const cleaned = data.articles.map(cleanArticle);
      const uniqueForView = cleaned.filter((article) => {
        const key = articleUniqKey(article);
        if (renderedArticleKeysRef.current.has(key)) return false;
        return true;
      });

      if (uniqueForView.length === 0) {
        reachedEndRef.current = currentIndex > 0;
        if (reachedEndRef.current) {
          if (reachedEndTimeoutIdRef.current) {
            window.clearTimeout(reachedEndTimeoutIdRef.current);
          }
          reachedEndTimeoutIdRef.current = window.setTimeout(() => {
            reachedEndRef.current = false;
            pendingLoadRef.current = false;

            const el = sentinelRef.current;
            if (!el || !feedReadyRef.current) return;

            const rect = el.getBoundingClientRect();
            const vh = window.innerHeight;
            const nearViewport =
              rect.top < vh + SENTINEL_PREFETCH_PX &&
              rect.bottom > -SENTINEL_PREFETCH_PX;

            if (nearViewport) void loadMore();
          }, REACHED_END_COOLDOWN_MS);
        }
        setError(
          currentIndex > 0
            ? "No more stories right now."
            : "No stories available yet — try again in a moment."
        );
        return;
      }

      // Remember the category for the next game slot's word bank
      if (data.category) lastArticleCategoryRef.current = data.category;

      const layoutPlan = chooseNewspaperLayout(uniqueForView, currentIndex);
      const section: ArticleFeedSection = {
        sectionType: "articles",
        articles: uniqueForView,
        index: currentIndex,
        newspaperLayout: layoutPlan,
      };

      const shouldInsertGapFiller =
        fillerEnabled && layoutPlan.residualGapPx >= fillerGapMinPx;
      const shouldInsertIntervalFiller =
        fillerEnabled &&
        !shouldInsertGapFiller &&
        articleSectionsRenderedRef.current > 0 &&
        articleSectionsRenderedRef.current % fillerInterval === 0;

      const nextSections: FeedSection[] = [section];
      if (shouldInsertGapFiller || shouldInsertIntervalFiller) {
        if (shouldInsertGapFiller) fillerMetricsRef.current.gapDetected += 1;
        const preferredModule = chooseModuleTypeForInsertion(currentIndex);
        let moduleSection = await fetchModuleSection({
          index: currentIndex + 1,
          reason: shouldInsertGapFiller ? "gap" : "interval",
          category: data.category,
          location:
            uniqueForView.find((entry) => entry.location?.trim())?.location ??
            undefined,
          moduleType: preferredModule,
        });

        if (!moduleSection && preferredModule === "spotify") {
          moduleSection = await fetchModuleSection({
            index: currentIndex + 1,
            reason: shouldInsertGapFiller ? "gap" : "interval",
            category: data.category,
            location:
              uniqueForView.find((entry) => entry.location?.trim())?.location ??
              undefined,
            moduleType: "weather",
          });
        }

        if (moduleSection) {
          nextSections.push(moduleSection);
          fillerMetricsRef.current.moduleInserted += 1;
          if (moduleSection.moduleType === "weather")
            fillerMetricsRef.current.weatherInserted += 1;
          if (moduleSection.moduleType === "spotify")
            fillerMetricsRef.current.spotifyInserted += 1;
          if (
            moduleSection.moduleType === "weather" &&
            (moduleSection.data as WeatherModuleData).mode === "generated_art"
          ) {
            fillerMetricsRef.current.artFallbackUsed += 1;
          }
          console.info("[feed-filler]", {
            reason: moduleSection.reason,
            moduleType: moduleSection.moduleType,
            residualGapPx: layoutPlan.residualGapPx,
            gapThresholdPx: fillerGapMinPx,
            metricSnapshot: fillerMetricsRef.current,
          });
        }
      }

      setSections((prev) => [...prev, ...nextSections]);
      for (const article of uniqueForView) {
        const key = articleUniqKey(article);
        renderedArticleKeysRef.current.add(key);
        if (
          "id" in article &&
          typeof article.id === "string" &&
          article.id.length > 0
        ) {
          renderedDbArticleIdsRef.current.add(article.id);
        }
      }
      articleSectionsRenderedRef.current += 1;
      sectionCountRef.current += nextSections.length;
    } catch (e: unknown) {
      const aborted = e instanceof Error && e.name === "AbortError";
      const msg = aborted
        ? "Request timed out — the server may still be sourcing stories. Scroll or retry in a moment."
        : e instanceof Error
          ? e.message
          : "Something went wrong.";
      setError(`Could not load stories — ${msg}`);
    } finally {
      loadingRef.current = false;
      setLoading(false);

      const el = sentinelRef.current;
      if (!el || reachedEndRef.current) return;

      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const nearViewport =
        rect.top < vh + SENTINEL_PREFETCH_PX &&
        rect.bottom > -SENTINEL_PREFETCH_PX;

      if (pendingLoadRef.current || nearViewport) {
        pendingLoadRef.current = false;
        requestAnimationFrame(() => {
          if (loadingRef.current || reachedEndRef.current) return;
          void loadMore();
        });
      } else {
        pendingLoadRef.current = false;
      }
    }
  }, [
    fillerEnabled,
    fillerGapMinPx,
    fillerInterval,
    fetchModuleSection,
    chooseModuleTypeForInsertion,
  ]); // stable refs + config

  // Resolve game ratio from server (or localStorage), then load — avoids first sections using DEFAULT_GAME_RATIO.
  useEffect(() => {
    if (!mfaPassed) {
      feedReadyRef.current = false;
      setIsFeedReady(false);
      return;
    }

    feedReadyRef.current = false;
    setIsFeedReady(false);

    // Fresh bootstrap for this user/session: reset feed cursors and visible sections.
    setSections([]);
    setError(null);
    setLoading(false);
    loadingRef.current = false;
    reachedEndRef.current = false;
    if (reachedEndTimeoutIdRef.current) {
      window.clearTimeout(reachedEndTimeoutIdRef.current);
      reachedEndTimeoutIdRef.current = null;
    }
    if (minGapRetryTimeoutIdRef.current) {
      window.clearTimeout(minGapRetryTimeoutIdRef.current);
      minGapRetryTimeoutIdRef.current = null;
    }
    pendingLoadRef.current = false;
    lastLoadStartAtRef.current = 0;
    sectionCountRef.current = 0;
    articleSectionsRenderedRef.current = 0;
    gameSlotOrdinalRef.current = 0;
    lastArticleCategoryRef.current = undefined;
    renderedArticleKeysRef.current = new Set();
    renderedDbArticleIdsRef.current = new Set();
    gameRatioRef.current = DEFAULT_GAME_RATIO;

    const gen = ++feedBootstrapGenRef.current;
    let cancelled = false;

    (async () => {
      let usedServerRatio = false;

      try {
        const res = await fetch("/api/user/preferences", {
          credentials: "include",
        });
        if (cancelled || gen !== feedBootstrapGenRef.current) return;

        if (res.ok) {
          const profile = await res.json();
          if (cancelled || gen !== feedBootstrapGenRef.current) return;

          if (
            typeof profile.gameRatio === "number" &&
            !Number.isNaN(profile.gameRatio)
          ) {
            const r = Math.min(1, Math.max(0, profile.gameRatio));
            gameRatioRef.current = r;
            localStorage.setItem("gentle_stream_game_ratio", String(r));
            usedServerRatio = true;
          }

          if (Array.isArray(profile.enabledGameTypes)) {
            enabledGameTypesRef.current = profile.enabledGameTypes.filter(
              (v: unknown): v is GameType => typeof v === "string"
            );
            try {
              localStorage.setItem(
                "gentle_stream_enabled_game_types",
                JSON.stringify(enabledGameTypesRef.current)
              );
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* offline or unauthenticated preview */
      }

      if (cancelled || gen !== feedBootstrapGenRef.current) return;

      if (!usedServerRatio) {
        const storedRatio = localStorage.getItem("gentle_stream_game_ratio");
        if (storedRatio !== null) {
          const ratio = parseFloat(storedRatio);
          if (!Number.isNaN(ratio)) {
            gameRatioRef.current = Math.min(1, Math.max(0, ratio));
          }
        }
      }

      if (enabledGameTypesRef.current == null) {
        try {
          const storedEnabled = localStorage.getItem("gentle_stream_enabled_game_types");
          if (storedEnabled) {
            const parsed = JSON.parse(storedEnabled) as unknown;
            if (Array.isArray(parsed)) {
              enabledGameTypesRef.current = parsed.filter(
                (v): v is GameType => typeof v === "string"
              );
            }
          }
        } catch {
          /* ignore */
        }
      }

      if (cancelled || gen !== feedBootstrapGenRef.current) return;

      feedReadyRef.current = true;
      setIsFeedReady(true);
      void loadMore();
    })();

    return () => {
      cancelled = true;
    };
  }, [userId, mfaPassed, loadMore]);

  useEffect(() => {
    setMfaPassed(userId === "dev-local");
  }, [userId]);

  useEffect(() => {
    function onEnabledTypesUpdated(e: Event) {
      const ce = e as CustomEvent<{ enabledGameTypes?: unknown }>;
      const enabled = ce.detail?.enabledGameTypes;
      if (Array.isArray(enabled)) {
        enabledGameTypesRef.current = enabled.filter(
          (v): v is GameType => typeof v === "string"
        );
        try {
          localStorage.setItem(
            "gentle_stream_enabled_game_types",
            JSON.stringify(enabledGameTypesRef.current)
          );
        } catch {
          /* ignore */
        }
      }

      reachedEndRef.current = false;
      if (reachedEndTimeoutIdRef.current) {
        window.clearTimeout(reachedEndTimeoutIdRef.current);
        reachedEndTimeoutIdRef.current = null;
      }
      if (minGapRetryTimeoutIdRef.current) {
        window.clearTimeout(minGapRetryTimeoutIdRef.current);
        minGapRetryTimeoutIdRef.current = null;
      }
      pendingLoadRef.current = false;
      setSections([]);
      sectionCountRef.current = 0;
      gameSlotOrdinalRef.current = 0;
      loadingRef.current = false;
      setLoading(false);
      setError(null);
      renderedArticleKeysRef.current = new Set();
      renderedDbArticleIdsRef.current = new Set();
      articleSectionsRenderedRef.current = 0;
      void loadMore();
    }

    window.addEventListener(
      "gentle-stream-enabled-game-types",
      onEnabledTypesUpdated as EventListener
    );
    return () =>
      window.removeEventListener(
        "gentle-stream-enabled-game-types",
        onEnabledTypesUpdated as EventListener
      );
  }, [loadMore]);

  // Keep activeCategoryRef in sync
  useEffect(() => {
    activeCategoryRef.current = activeCategory;
  }, [activeCategory]);

  useEffect(() => {
    activeKindFilterRef.current = activeKindFilter;
  }, [activeKindFilter]);

  // Re-attach when sections change so layout updates don't leave the sentinel unobserved
  useEffect(() => {
    if (!isFeedReady) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        if (loadingRef.current) pendingLoadRef.current = true;
        else void loadMore();
      },
      { threshold: 0, rootMargin: `0px 0px ${SENTINEL_PREFETCH_PX}px 0px` }
    );
    observerRef.current = io;
    if (el) io.observe(el);
    return () => io.disconnect();
  }, [isFeedReady, loadMore]);

  useEffect(() => {
    return () => {
      if (reachedEndTimeoutIdRef.current) {
        window.clearTimeout(reachedEndTimeoutIdRef.current);
        reachedEndTimeoutIdRef.current = null;
      }
      if (minGapRetryTimeoutIdRef.current) {
        window.clearTimeout(minGapRetryTimeoutIdRef.current);
        minGapRetryTimeoutIdRef.current = null;
      }
    };
  }, []);

  const handleCategorySelect = (cat: Category) => {
    const next = activeCategory === cat ? null : cat;
    setActiveCategory(next);
    activeCategoryRef.current = next;
    reachedEndRef.current = false;
    if (reachedEndTimeoutIdRef.current) {
      window.clearTimeout(reachedEndTimeoutIdRef.current);
      reachedEndTimeoutIdRef.current = null;
    }
    if (minGapRetryTimeoutIdRef.current) {
      window.clearTimeout(minGapRetryTimeoutIdRef.current);
      minGapRetryTimeoutIdRef.current = null;
    }
    pendingLoadRef.current = false;
    setSections((prev) => {
      return [];
    });
    sectionCountRef.current = 0;
    articleSectionsRenderedRef.current = 0;
    loadingRef.current = false;
    setLoading(false);
    lastArticleCategoryRef.current = undefined;
    renderedArticleKeysRef.current = new Set();
    renderedDbArticleIdsRef.current = new Set();
    loadMore(next);
  };

  const handleGameRatioSaved = useCallback(
    (ratio: number) => {
      gameRatioRef.current = ratio;
      localStorage.setItem("gentle_stream_game_ratio", String(ratio));
      reachedEndRef.current = false;
      if (reachedEndTimeoutIdRef.current) {
        window.clearTimeout(reachedEndTimeoutIdRef.current);
        reachedEndTimeoutIdRef.current = null;
      }
      if (minGapRetryTimeoutIdRef.current) {
        window.clearTimeout(minGapRetryTimeoutIdRef.current);
        minGapRetryTimeoutIdRef.current = null;
      }
      pendingLoadRef.current = false;
      setSections([]);
      sectionCountRef.current = 0;
      articleSectionsRenderedRef.current = 0;
      gameSlotOrdinalRef.current = 0;
      loadingRef.current = false;
      setError(null);
      renderedArticleKeysRef.current = new Set();
      renderedDbArticleIdsRef.current = new Set();
      void loadMore();
    },
    [loadMore]
  );

  const handleKindFilterSelect = useCallback(
    (next: FeedKindFilter) => {
      if (next === activeKindFilterRef.current) return;
      setActiveKindFilter(next);
      activeKindFilterRef.current = next;
      reachedEndRef.current = false;
      if (reachedEndTimeoutIdRef.current) {
        window.clearTimeout(reachedEndTimeoutIdRef.current);
        reachedEndTimeoutIdRef.current = null;
      }
      if (minGapRetryTimeoutIdRef.current) {
        window.clearTimeout(minGapRetryTimeoutIdRef.current);
        minGapRetryTimeoutIdRef.current = null;
      }
      pendingLoadRef.current = false;
      setSections([]);
      sectionCountRef.current = 0;
      articleSectionsRenderedRef.current = 0;
      gameSlotOrdinalRef.current = 0;
      loadingRef.current = false;
      setLoading(false);
      setError(null);
      lastArticleCategoryRef.current = undefined;
      renderedArticleKeysRef.current = new Set();
      renderedDbArticleIdsRef.current = new Set();
      void loadMore();
    },
    [loadMore]
  );

  if (!mfaPassed) {
    return <MfaChallengeGate onPassed={() => setMfaPassed(true)} />;
  }

  return (
    <div style={{ background: "#ede9e1", minHeight: "100vh" }}>
      <Masthead
        accountSlot={
          userEmail ? (
            <ProfileMenu
              userEmail={userEmail}
              onGameRatioSaved={handleGameRatioSaved}
              isAdmin={isAdmin}
            />
          ) : undefined
        }
      />
      <CategoryDrawer
        selected={activeCategory}
        onSelect={handleCategorySelect}
        topOffsetPx={MASTHEAD_TOP_BAR_HEIGHT_PX}
      />

      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          padding: "0.55rem 0.85rem 0",
          display: "flex",
          gap: "0.4rem",
          flexWrap: "wrap",
          alignItems: "center",
          background: "#faf8f3",
        }}
      >
        {(
          [
            { value: "all", label: "All" },
            { value: "news", label: "News" },
            { value: "user_article", label: "User articles" },
            { value: "recipe", label: "Recipes" },
          ] as const
        ).map((option) => {
          const active = activeKindFilter === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => handleKindFilterSelect(option.value)}
              style={{
                border: active ? "2px solid #1a1a1a" : "1px solid #d8d2c7",
                background: active ? "#c8a84b" : "#fff",
                color: "#1a1a1a",
                padding: "0.35rem 0.55rem",
                fontFamily: "'Playfair Display', Georgia, serif",
                fontSize: "0.7rem",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {liveGenerating && (
        <div
          style={{
            background: "#fdf6e3",
            borderBottom: "1px solid #e8d9a0",
            padding: "0.5rem 1.5rem",
            textAlign: "center",
            fontFamily: "'IM Fell English', Georgia, serif",
            fontStyle: "italic",
            fontSize: "0.78rem",
            color: "#7a6a30",
            maxWidth: "1200px",
            margin: "0 auto",
          }}
        >
          Freshly sourced — our editors are searching the world for your
          stories&hellip;
        </div>
      )}

      <main
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          background: "#faf8f3",
          boxShadow: "0 0 60px rgba(0,0,0,0.13)",
        }}
      >
        {sections.length === 0 && !loading && !error && (
          <div
            style={{
              padding: "6rem 2rem",
              textAlign: "center",
              fontFamily: "'IM Fell English', Georgia, serif",
              color: "#aaa",
              fontSize: "1.05rem",
              fontStyle: "italic",
            }}
          >
            Loading today&apos;s stream&hellip;
          </div>
        )}

        {sections.map((section) => {
          if (section.sectionType === "game") {
            return (
              <GameSlot
                key={`game-${section.index}`}
                gameType={section.gameType}
                difficulty={section.difficulty}
              />
            );
          }
          if (section.sectionType === "module" || section.sectionType === "filler") {
            if (section.moduleType === "spotify") {
              return (
                <SpotifyMoodTile
                  key={`module-${section.index}-spotify`}
                  data={section.data as SpotifyMoodTileData}
                  reason={section.reason}
                />
              );
            }
            return (
              <WeatherFillerCard
                key={`module-${section.index}-weather`}
                data={section.data as WeatherModuleData}
                reason={section.reason}
              />
            );
          }
          if (section.sectionType === "articles") {
            return (
              <NewsSection
                key={`news-${section.index}`}
                articles={section.articles}
                sectionIndex={section.index}
                layoutPlan={section.newspaperLayout}
              />
            );
          }
          return null;
        })}

        {error && (
          <ErrorBanner
            message={error}
            onRetry={() => {
              reachedEndRef.current = false;
              if (reachedEndTimeoutIdRef.current) {
                window.clearTimeout(reachedEndTimeoutIdRef.current);
                reachedEndTimeoutIdRef.current = null;
              }
              if (minGapRetryTimeoutIdRef.current) {
                window.clearTimeout(minGapRetryTimeoutIdRef.current);
                minGapRetryTimeoutIdRef.current = null;
              }
              pendingLoadRef.current = false;
              void loadMore();
            }}
          />
        )}

        {/* Sentinel — observed directly. Kept before the loading UI so it doesn't shift while loading. */}
        <div ref={sentinelRef} style={{ height: "1px" }} />
        {loading && <LoadingSection />}

        <footer
          style={{
            padding: "2rem",
            textAlign: "center",
            borderTop: "3px double #1a1a1a",
            fontFamily: "'IM Fell English', Georgia, serif",
            fontSize: "0.73rem",
            color: "#999",
            letterSpacing: "0.05em",
          }}
        >
          &copy; Gentle Stream &nbsp;&middot;&nbsp; Powered by AI
          &nbsp;&middot;&nbsp; Only the uplifting, only the inspiring
        </footer>
      </main>
    </div>
  );
}
