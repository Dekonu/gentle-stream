import dns from "node:dns/promises";
import net from "node:net";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_HTML_BYTES = 1_200_000; // ~1.2MB

interface ImportCacheEntry {
  at: number;
  payload: RecipeImportPayload;
}

const importCache = new Map<string, ImportCacheEntry>();

const importStats = {
  cacheHits: 0,
  jsonldHits: 0,
  heuristicHits: 0,
  claudeHits: 0,
  failures: 0,
};

export interface RecipeImportPayload {
  headline: string;
  subheadline: string;
  recipeServings: number | null;
  recipeIngredients: string[];
  recipeInstructions: string[];
  recipePrepTimeMinutes: number | null;
  recipeCookTimeMinutes: number | null;
  recipeImages: string[];
  sourceUrl: string;
  sourceStage: "cache" | "jsonld" | "heuristic" | "claude";
  warnings: string[];
}

export interface ImportRecipeOptions {
  url: string;
  allowlist: string[];
  enableClaudeFallback: boolean;
}

function normalizeInputUrl(raw: string): URL {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("URL cannot be empty.");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http:// and https:// URLs are supported.");
  }
  parsed.hash = "";
  return parsed;
}

function normalizeHost(hostname: string): string {
  return hostname.trim().toLowerCase();
}

function allowPatternToRegex(pattern: string): RegExp | null {
  const trimmed = normalizeHost(pattern);
  if (!trimmed) return null;
  // Common expectation: "*.example.com" should allow both:
  // - example.com
  // - any.sub.example.com
  if (trimmed.startsWith("*.")) {
    const base = trimmed.slice(2).replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    try {
      return new RegExp(`^(?:.*\\.)?${base}$`, "i");
    } catch {
      return null;
    }
  }
  // Glob-style wildcard support, e.g.:
  // - *.example.com
  // - recipe.*.example.com
  // - *example.net
  const escaped = trimmed.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  const regexSource = `^${escaped.replace(/\\\*/g, ".*")}$`;
  try {
    return new RegExp(regexSource, "i");
  } catch {
    return null;
  }
}

function hostMatchesAllowlist(hostname: string, allowlist: string[]): boolean {
  const host = normalizeHost(hostname);
  return allowlist.some((entry) => {
    const normalized = normalizeHost(entry);
    if (!normalized) return false;
    if (normalized.includes("*")) {
      const re = allowPatternToRegex(normalized);
      return re ? re.test(host) : false;
    }
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) return true; // fe80::/10
  return false;
}

async function assertSafeHost(url: URL, allowlist: string[]): Promise<void> {
  const host = normalizeHost(url.hostname);
  if (!hostMatchesAllowlist(host, allowlist)) {
    throw new Error("That domain is not allowlisted for recipe import.");
  }
  if (host === "localhost" || host.endsWith(".local")) {
    throw new Error("Local/private hosts are not allowed.");
  }
  if (net.isIP(host)) {
    if ((net.isIP(host) === 4 && isPrivateIpv4(host)) || (net.isIP(host) === 6 && isPrivateIpv6(host))) {
      throw new Error("Private IP targets are not allowed.");
    }
    return;
  }

  const [aRecords, aaaaRecords] = await Promise.allSettled([
    dns.resolve4(host),
    dns.resolve6(host),
  ]);
  const ips: string[] = [];
  if (aRecords.status === "fulfilled") ips.push(...aRecords.value);
  if (aaaaRecords.status === "fulfilled") ips.push(...aaaaRecords.value);
  if (ips.length === 0) {
    throw new Error("Could not resolve target host.");
  }
  for (const ip of ips) {
    if ((net.isIP(ip) === 4 && isPrivateIpv4(ip)) || (net.isIP(ip) === 6 && isPrivateIpv6(ip))) {
      throw new Error("Target resolves to private IP space.");
    }
  }
}

async function fetchHtmlWithSafeRedirects(start: URL, allowlist: string[]): Promise<{ finalUrl: string; html: string }> {
  let current = new URL(start.toString());
  for (let i = 0; i < 4; i++) {
    await assertSafeHost(current, allowlist);
    const response = await fetch(current.toString(), {
      redirect: "manual",
      headers: {
        // Use a browser-like request shape; many recipe sites block obvious bot UAs.
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
    });

    const isRedirect = response.status >= 300 && response.status < 400;
    if (isRedirect) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Redirect response missing location.");
      current = new URL(location, current);
      continue;
    }

    if (!response.ok) {
      if (response.status === 403) {
        throw new Error(
          "Source blocked automated access (HTTP 403). Try another allowlisted recipe site."
        );
      }
      throw new Error(`Source returned HTTP ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error("URL did not return an HTML page.");
    }
    const html = await response.text();
    if (html.length > MAX_HTML_BYTES) {
      throw new Error("Recipe page is too large to import.");
    }
    return { finalUrl: current.toString(), html };
  }
  throw new Error("Too many redirects.");
}

function decodeEntities(input: string): string {
  const entityMap: Record<string, string> = {
    nbsp: " ",
    amp: "&",
    quot: '"',
    "#39": "'",
    lt: "<",
    gt: ">",
  };
  // Single-pass entity decode avoids accidental double-decoding (e.g., &amp;lt; -> &lt;).
  return input.replace(/&(nbsp|amp|quot|#39|lt|gt);/gi, (full, rawName: string) => {
    const normalized = rawName.toLowerCase();
    return entityMap[normalized] ?? full;
  });
}

function cleanText(input: string): string {
  return decodeEntities(
    input
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function cleanList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const cleaned = item.replace(/\s+/g, " ").trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

function parseDurationToMinutes(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const value = raw.trim();
  const iso = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/i.exec(value);
  if (iso) {
    const days = Number(iso[1] ?? "0");
    const hours = Number(iso[2] ?? "0");
    const mins = Number(iso[3] ?? "0");
    const total = days * 24 * 60 + hours * 60 + mins;
    return Number.isFinite(total) && total >= 0 ? total : null;
  }
  const hoursMatch = /(\d+(?:\.\d+)?)\s*h(?:ou)?r/i.exec(value);
  const minsMatch = /(\d+(?:\.\d+)?)\s*m(?:in)?/i.exec(value);
  const hours = hoursMatch ? Number(hoursMatch[1]) : 0;
  const mins = minsMatch ? Number(minsMatch[1]) : 0;
  const total = Math.round(hours * 60 + mins);
  if (total > 0) return total;
  const pureNumber = Number(value.replace(/[^\d.]/g, ""));
  if (Number.isFinite(pureNumber) && pureNumber >= 0) return Math.round(pureNumber);
  return null;
}

function parseServings(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    const n = Math.trunc(raw);
    return n > 0 ? n : null;
  }
  if (typeof raw !== "string") return null;
  const match = raw.match(/(\d{1,3})/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseJsonLdRecipes(html: string): Array<Record<string, unknown>> {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const recipes: Array<Record<string, unknown>> = [];
  for (const script of scripts) {
    const content = (script[1] ?? "").trim();
    if (!content) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      continue;
    }
    const candidates: unknown[] = Array.isArray(parsed) ? parsed : [parsed];
    const queue: unknown[] = [...candidates];
    while (queue.length > 0) {
      const node = queue.shift();
      if (!node || typeof node !== "object") continue;
      const asRecord = node as Record<string, unknown>;
      const typeValue = asRecord["@type"];
      const types = Array.isArray(typeValue) ? typeValue.map(String) : typeValue ? [String(typeValue)] : [];
      if (types.some((t) => t.toLowerCase() === "recipe")) {
        recipes.push(asRecord);
      }
      if (Array.isArray(asRecord["@graph"])) {
        queue.push(...(asRecord["@graph"] as unknown[]));
      }
      if (Array.isArray(asRecord["itemListElement"])) {
        queue.push(...(asRecord["itemListElement"] as unknown[]));
      }
    }
  }
  return recipes;
}

function toImageUrls(raw: unknown): string[] {
  const out: string[] = [];
  const pushMaybe = (value: unknown) => {
    if (typeof value === "string" && value.startsWith("http")) out.push(value);
    if (value && typeof value === "object") {
      const url = (value as { url?: unknown }).url;
      if (typeof url === "string" && url.startsWith("http")) out.push(url);
    }
  };
  if (Array.isArray(raw)) raw.forEach(pushMaybe);
  else pushMaybe(raw);
  return cleanList(out).slice(0, 3);
}

function normalizeInstructions(raw: unknown): string[] {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node) return;
    if (typeof node === "string") {
      out.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === "object") {
      const rec = node as Record<string, unknown>;
      if (typeof rec.text === "string") out.push(rec.text);
      else if (typeof rec.name === "string") out.push(rec.name);
      if (rec.itemListElement) walk(rec.itemListElement);
    }
  };
  walk(raw);
  return cleanList(
    out
      .flatMap((line) =>
        line
          .split(/\n+/)
          .map((s) => s.trim())
          .filter(Boolean)
      )
  );
}

function recipeFromJsonLd(html: string, sourceUrl: string): RecipeImportPayload | null {
  const recipes = parseJsonLdRecipes(html);
  if (recipes.length === 0) return null;

  let best: Record<string, unknown> | null = null;
  let bestScore = -1;
  for (const recipe of recipes) {
    const score =
      (typeof recipe.name === "string" ? 1 : 0) +
      (Array.isArray(recipe.recipeIngredient) ? 2 : 0) +
      (recipe.recipeInstructions ? 2 : 0);
    if (score > bestScore) {
      best = recipe;
      bestScore = score;
    }
  }
  if (!best) return null;

  const headline = typeof best.name === "string" ? cleanText(best.name) : "";
  const subheadline = typeof best.description === "string" ? cleanText(best.description) : "";
  const ingredients = cleanList(
    (Array.isArray(best.recipeIngredient) ? best.recipeIngredient : [])
      .filter((x): x is string => typeof x === "string")
      .map(cleanText)
  );
  const instructions = normalizeInstructions(best.recipeInstructions);
  const servings = parseServings(best.recipeYield ?? best.yield);
  const prep = parseDurationToMinutes(
    typeof best.prepTime === "string" ? best.prepTime : null
  );
  const cook = parseDurationToMinutes(
    typeof best.cookTime === "string" ? best.cookTime : null
  );
  const images = toImageUrls(best.image);

  if (!headline || ingredients.length === 0 || instructions.length === 0) {
    return null;
  }

  return {
    headline,
    subheadline,
    recipeServings: servings,
    recipeIngredients: ingredients,
    recipeInstructions: instructions,
    recipePrepTimeMinutes: prep,
    recipeCookTimeMinutes: cook,
    recipeImages: images,
    sourceUrl,
    sourceStage: "jsonld",
    warnings: [],
  };
}

function extractTagContents(html: string, tagName: string): string[] {
  return [...html.matchAll(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "gi"))].map(
    (m) => cleanText(m[1] ?? "")
  );
}

function extractMetaContent(html: string, key: string): string | null {
  const re = new RegExp(`<meta[^>]*(?:name|property)=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
  const match = re.exec(html);
  return match ? cleanText(match[1]) : null;
}

function recipeFromHeuristics(html: string, sourceUrl: string): RecipeImportPayload | null {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? cleanText(titleMatch[1]) : "";
  const headline = extractMetaContent(html, "og:title") ?? title;
  const subheadline = extractMetaContent(html, "description") ?? extractMetaContent(html, "og:description") ?? "";

  const itempropIngredients = [
    ...html.matchAll(/<[^>]*itemprop=["']recipeIngredient["'][^>]*>([\s\S]*?)<\/[^>]+>/gi),
  ].map((m) => cleanText(m[1] ?? ""));

  const itempropInstructions = [
    ...html.matchAll(/<[^>]*itemprop=["']recipeInstructions["'][^>]*>([\s\S]*?)<\/[^>]+>/gi),
  ].map((m) => cleanText(m[1] ?? ""));

  const allListItems = extractTagContents(html, "li");
  const likelyIngredients =
    itempropIngredients.length > 0
      ? itempropIngredients
      : allListItems.filter((li) =>
          /\b(cup|cups|tbsp|tablespoon|tsp|teaspoon|oz|ounce|gram|g|kg|ml|l|clove|pinch)\b/i.test(li)
        );

  const likelyInstructions =
    itempropInstructions.length > 0
      ? itempropInstructions
      : allListItems.filter((li) => /\b(stir|mix|bake|cook|heat|boil|simmer|preheat|serve)\b/i.test(li));

  const rawText = cleanText(html);
  const servings = parseServings((/serv(?:e|ing|es)[^\d]{0,16}(\d{1,3})/i.exec(rawText) ?? [])[1]);
  const prep = parseDurationToMinutes((/prep(?:\s*time)?[^0-9]{0,10}([0-9hmin :]+)/i.exec(rawText) ?? [])[1] ?? null);
  const cook = parseDurationToMinutes((/cook(?:\s*time)?[^0-9]{0,10}([0-9hmin :]+)/i.exec(rawText) ?? [])[1] ?? null);

  const images = cleanList([
    ...(extractMetaContent(html, "og:image") ? [extractMetaContent(html, "og:image") as string] : []),
  ]).filter((u) => u.startsWith("http")).slice(0, 3);

  const ingredients = cleanList(likelyIngredients);
  const instructions = cleanList(likelyInstructions);

  if (!headline || ingredients.length < 2 || instructions.length < 2) {
    return null;
  }

  return {
    headline,
    subheadline,
    recipeServings: servings,
    recipeIngredients: ingredients,
    recipeInstructions: instructions,
    recipePrepTimeMinutes: prep,
    recipeCookTimeMinutes: cook,
    recipeImages: images,
    sourceUrl,
    sourceStage: "heuristic",
    warnings: [],
  };
}

function buildClaudeEvidence(html: string): string {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const title = titleMatch ? cleanText(titleMatch[1]) : "";
  const desc = extractMetaContent(html, "description") ?? "";
  const li = extractTagContents(html, "li").slice(0, 200).join("\n");
  const body = cleanText(html).slice(0, 7000);
  return `TITLE:\n${title}\n\nDESCRIPTION:\n${desc}\n\nLIST_ITEMS:\n${li}\n\nPAGE_TEXT_SNIPPET:\n${body}`;
}

async function recipeFromClaude(html: string, sourceUrl: string): Promise<RecipeImportPayload | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;
  const evidence = buildClaudeEvidence(html);
  const prompt =
    `Extract recipe data from the evidence below. Return strict raw JSON only.\n` +
    `Use shape:\n` +
    `{"headline":"", "subheadline":"", "recipeServings": number|null, "recipeIngredients": string[], "recipeInstructions": string[], "recipePrepTimeMinutes": number|null, "recipeCookTimeMinutes": number|null, "recipeImages": string[]}\n` +
    `Rules: max 3 image URLs (https only), dedupe ingredients/instructions, integers only for minutes/servings, null if unknown.\n\n` +
    evidence;

  const res = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 450,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const textBlock = (data.content ?? []).find((b: { type?: string }) => b.type === "text");
  const raw = typeof textBlock?.text === "string" ? textBlock.text : "";
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }
  const rec = parsed as Record<string, unknown>;
  const headline = typeof rec.headline === "string" ? cleanText(rec.headline) : "";
  const subheadline = typeof rec.subheadline === "string" ? cleanText(rec.subheadline) : "";
  const ingredients = cleanList(Array.isArray(rec.recipeIngredients) ? rec.recipeIngredients.filter((x): x is string => typeof x === "string").map(cleanText) : []);
  const instructions = cleanList(Array.isArray(rec.recipeInstructions) ? rec.recipeInstructions.filter((x): x is string => typeof x === "string").map(cleanText) : []);
  const servings = parseServings(rec.recipeServings);
  const prep = parseDurationToMinutes(typeof rec.recipePrepTimeMinutes === "string" ? rec.recipePrepTimeMinutes : String(rec.recipePrepTimeMinutes ?? ""));
  const cook = parseDurationToMinutes(typeof rec.recipeCookTimeMinutes === "string" ? rec.recipeCookTimeMinutes : String(rec.recipeCookTimeMinutes ?? ""));
  const images = cleanList(Array.isArray(rec.recipeImages) ? rec.recipeImages.filter((x): x is string => typeof x === "string").filter((u) => u.startsWith("http")) : []).slice(0, 3);

  if (!headline || ingredients.length === 0 || instructions.length === 0) return null;

  return {
    headline,
    subheadline,
    recipeServings: servings,
    recipeIngredients: ingredients,
    recipeInstructions: instructions,
    recipePrepTimeMinutes: prep,
    recipeCookTimeMinutes: cook,
    recipeImages: images,
    sourceUrl,
    sourceStage: "claude",
    warnings: [],
  };
}

function isCompleteEnough(payload: RecipeImportPayload): boolean {
  return (
    payload.headline.trim().length > 0 &&
    payload.recipeIngredients.length > 0 &&
    payload.recipeInstructions.length > 0
  );
}

function cacheKey(url: string): string {
  return url.trim().toLowerCase();
}

export async function importRecipeFromUrl(options: ImportRecipeOptions): Promise<RecipeImportPayload> {
  const parsed = normalizeInputUrl(options.url);
  const key = cacheKey(parsed.toString());
  const now = Date.now();
  const cached = importCache.get(key);
  if (cached && now - cached.at <= CACHE_TTL_MS) {
    importStats.cacheHits += 1;
    return {
      ...cached.payload,
      sourceStage: "cache",
      warnings: [...cached.payload.warnings, "Served from cache."],
    };
  }

  const { finalUrl, html } = await fetchHtmlWithSafeRedirects(parsed, options.allowlist);
  const warnings: string[] = [];

  const jsonLdPayload = recipeFromJsonLd(html, finalUrl);
  if (jsonLdPayload && isCompleteEnough(jsonLdPayload)) {
    importStats.jsonldHits += 1;
    importCache.set(key, { at: now, payload: jsonLdPayload });
    return jsonLdPayload;
  }
  if (!jsonLdPayload) warnings.push("No complete recipe JSON-LD found.");

  const heuristicPayload = recipeFromHeuristics(html, finalUrl);
  if (heuristicPayload && isCompleteEnough(heuristicPayload)) {
    importStats.heuristicHits += 1;
    heuristicPayload.warnings = [...heuristicPayload.warnings, ...warnings];
    importCache.set(key, { at: now, payload: heuristicPayload });
    return heuristicPayload;
  }
  warnings.push("Heuristic extraction was incomplete.");

  if (options.enableClaudeFallback) {
    const claudePayload = await recipeFromClaude(html, finalUrl);
    if (claudePayload && isCompleteEnough(claudePayload)) {
      importStats.claudeHits += 1;
      claudePayload.warnings = [...claudePayload.warnings, ...warnings];
      importCache.set(key, { at: now, payload: claudePayload });
      return claudePayload;
    }
  }

  importStats.failures += 1;
  console.warn("[RecipeImport] failed", {
    url: finalUrl,
    stats: importStats,
  });
  throw new Error(
    "Could not confidently extract a recipe from this URL. Try another source or paste details manually."
  );
}

