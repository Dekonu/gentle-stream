/**
 * Ingest Agent
 *
 * Fetches one article per API call to avoid truncation, using real token
 * usage from each response to decide whether to request another immediately
 * or wait out the 65-second rate-limit window first.
 *
 * Flow per article:
 *   1. Check token budget — wait if exhausted
 *   2. Request exactly 1 article (web search + write JSON)
 *   3. Read response.usage.input_tokens and add to window counter
 *   4. Parse and insert article
 *   5. If budget remains, go to 1 immediately; otherwise wait then go to 1
 */

import type { Category } from "../constants";
import { INGEST_BATCH_SIZE } from "../constants";
import type { RawArticle, StoredArticle } from "../types";
import { insertArticles, getRecentHeadlines } from "../db/articles";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";

// ─── Token budget ─────────────────────────────────────────────────────────────
// Anthropic free tier: 30,000 input tokens/min.
// We stay under by tracking real usage from response.usage.input_tokens.
const TOKEN_LIMIT_PER_WINDOW = 25_000; // conservative buffer below 30k hard limit
const WINDOW_MS = 65_000;              // 65s window (slight overrun for safety)

let windowStart = Date.now();
let tokensUsedInWindow = 0;

/**
 * Record real token usage and wait if the window is exhausted.
 * Must be called AFTER a successful API response with its real input_tokens.
 */
async function recordUsageAndWaitIfNeeded(inputTokens: number): Promise<void> {
  const now = Date.now();
  const elapsed = now - windowStart;

  // Reset window if it's expired
  if (elapsed >= WINDOW_MS) {
    windowStart = now;
    tokensUsedInWindow = 0;
    console.log("[IngestAgent] Token window reset");
  }

  tokensUsedInWindow += inputTokens;
  console.log(
    `[IngestAgent] Tokens used this window: ${tokensUsedInWindow}/${TOKEN_LIMIT_PER_WINDOW}`
  );

  // If next request would breach the limit, wait out the remainder of the window
  if (tokensUsedInWindow >= TOKEN_LIMIT_PER_WINDOW) {
    const remaining = WINDOW_MS - (Date.now() - windowStart);
    const waitMs = Math.max(remaining + 500, 0);
    console.log(
      `[IngestAgent] Budget exhausted — waiting ${Math.round(waitMs / 1000)}s for window reset`
    );
    await new Promise((r) => setTimeout(r, waitMs));
    windowStart = Date.now();
    tokensUsedInWindow = 0;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface IngestResult {
  category: Category;
  inserted: StoredArticle[];
  error?: string;
}

interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Ingest articles for one category, one article per API call.
 * Uses real token counts to decide when to pause vs continue immediately.
 */
export async function runIngestAgent(
  category: Category,
  total: number = INGEST_BATCH_SIZE
): Promise<IngestResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const allInserted: StoredArticle[] = [];

  // Pre-seed the avoid list from the DB so re-runs never repeat stored stories
  const seenHeadlines: string[] = await getRecentHeadlines(category, 20);
  console.log(
    `[IngestAgent] "${category}" — ${seenHeadlines.length} existing headlines loaded as avoid-list`
  );

  console.log(`[IngestAgent] Starting ingest for "${category}", target: ${total} articles`);

  for (let i = 0; i < total; i++) {
    try {
      const { article, usage } = await fetchOneArticle(apiKey, category, seenHeadlines);

      // Store the article
      const toInsert = {
        ...article,
        category,
        tags: [],
        sentiment: "uplifting" as const,
        emotions: [],
        locale: "global",
        readingTimeSecs: estimateReadingTime(article.body),
        qualityScore: 0.5,
      };

      const [inserted] = await insertArticles([toInsert]);
      allInserted.push(inserted);
      seenHeadlines.push(article.headline);

      console.log(
        `[IngestAgent] "${category}" article ${i + 1}/${total} inserted: "${article.headline.slice(0, 50)}"`
      );

      // Update token budget with real usage — will wait here if needed
      await recordUsageAndWaitIfNeeded(usage.input_tokens);

    } catch (e) {
      console.error(`[IngestAgent] Error on article ${i + 1} for "${category}":`, e);
      // On error, wait a beat before retrying the slot
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  console.log(
    `[IngestAgent] "${category}" complete: ${allInserted.length}/${total} articles inserted`
  );

  return { category, inserted: allInserted };
}

/**
 * Run ingest across ALL categories sequentially.
 */
export async function runFullIngest(): Promise<IngestResult[]> {
  const { CATEGORIES } = await import("../constants");
  const results: IngestResult[] = [];
  for (const cat of CATEGORIES) {
    results.push(await runIngestAgent(cat as Category));
  }
  return results;
}

// ─── Core fetch — exactly 1 article per call ──────────────────────────────────

async function fetchOneArticle(
  apiKey: string,
  category: string,
  seenHeadlines: string[]
): Promise<{ article: RawArticle; usage: ClaudeUsage }> {
  const avoid = seenHeadlines.slice(-5).join("; ");
  const avoidClause = avoid ? ` Do not repeat these stories: ${avoid}.` : "";

  // Tight prompt — 1 object, no array wrapper needed, clear schema
  const prompt =
    `Search the web for 1 real, recent, uplifting news story in: "${category}". ` +
    `Positive only — no deaths, crimes, or disasters.${avoidClause}\n\n` +
    `IMPORTANT: Write the body in plain prose. Do NOT include any citation markup, ` +
    `<cite> tags, reference numbers, or source links inside the text.\n\n` +
    `Return ONLY a single raw JSON object — no array, no markdown, no preamble:\n` +
    `{"headline":"string","subheadline":"string","byline":"By Name","location":"City, Country",` +
    `"category":"${category}","body":"paragraph1\\n\\nparagraph2\\n\\nparagraph3","pullQuote":"string","imagePrompt":"string"}`;

  const makeRequest = async (attempt: number): Promise<Response> => {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "web-search-2025-03-05",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024, // 1 article easily fits in 1024 output tokens
        tools: [{ type: "web_search_20250305", name: "web_search" }],
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (res.status === 429 && attempt < 3) {
      const wait = (attempt + 1) * 12_000;
      console.log(`[IngestAgent] 429 rate limit — retrying in ${wait / 1000}s`);
      await new Promise((r) => setTimeout(r, wait));
      return makeRequest(attempt + 1);
    }
    return res;
  };

  const response = await makeRequest(0);

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API ${response.status}: ${err}`);
  }

  const data = await response.json();
  const usage: ClaudeUsage = data.usage ?? { input_tokens: 1500, output_tokens: 500 };

  if (data.stop_reason === "max_tokens") {
    console.warn("[IngestAgent] max_tokens hit even for single article — attempting recovery");
  }

  // Collect all text blocks
  const blocks: Array<{ type: string; text?: string }> = data.content ?? [];
  const combinedText = blocks
    .filter((b) => b.type === "text" && b.text)
    .map((b) => b.text!)
    .join("\n");

  if (!combinedText) {
    console.error("[IngestAgent] No text blocks. Response:", JSON.stringify(data));
    throw new Error("No text blocks in Claude response");
  }

  const article = parseArticleFromText(combinedText, category);
  return { article, usage };
}

// ─── Parser ───────────────────────────────────────────────────────────────────

function parseArticleFromText(text: string, category: string): RawArticle {
  const cleaned = text.replace(/```json|```/g, "").trim();

  // Try a single object first (our preferred format)
  const objStart = cleaned.indexOf("{");
  const objEnd = cleaned.lastIndexOf("}");

  // Also handle if Claude wrapped it in an array anyway
  const arrStart = cleaned.indexOf("[");
  const arrEnd = cleaned.lastIndexOf("]");

  let parsed: RawArticle | RawArticle[] | null = null;

  // Prefer object, fall back to array
  if (objStart !== -1 && objEnd !== -1) {
    try {
      parsed = JSON.parse(cleaned.slice(objStart, objEnd + 1));
    } catch {
      // fall through to array attempt
    }
  }

  if (!parsed && arrStart !== -1 && arrEnd !== -1) {
    try {
      const arr = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
      parsed = Array.isArray(arr) ? arr[0] : arr;
    } catch {
      // fall through
    }
  }

  if (!parsed) {
    console.error("[IngestAgent] Could not parse JSON from:\n", cleaned.slice(0, 400));
    throw new Error("JSON parse failed — no valid object or array found");
  }

  const article = Array.isArray(parsed) ? parsed[0] : parsed;

  // Strip any <cite> tags Claude injects from web search citations
  return {
    headline:    stripCitations(article.headline    ?? "Untitled"),
    subheadline: stripCitations(article.subheadline ?? ""),
    byline:      article.byline    ?? "By Staff Reporter",
    location:    article.location  ?? "Global",
    category:    (article.category ?? category) as RawArticle["category"],
    body:        stripCitations(article.body        ?? ""),
    pullQuote:   stripCitations(article.pullQuote   ?? ""),
    imagePrompt: stripCitations(article.imagePrompt ?? ""),
  };
}

// ─── Utility ──────────────────────────────────────────────────────────────────

function estimateReadingTime(body: string): number {
  return Math.round((body.split(/\s+/).length / 200) * 60);
}

/**
 * Strip <cite index="...">...</cite> tags that Claude injects when web search
 * citations leak into the generated article text. Also removes bare </cite>.
 */
function stripCitations(text: string): string {
  return text
    .replace(/<cite[^>]*>/gi, "")
    .replace(/<\/cite>/gi, "")
    .trim();
}
