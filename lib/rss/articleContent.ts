import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { normalizeRssNarrativeText } from "./rssNarrativeMerge";

const ARTICLE_FETCH_TIMEOUT_MS = 8_000;
const ARTICLE_HTML_MAX_CHARS = 500_000;

/**
 * `source_urls` in the DB are often `normaliseUrl()` output (`host/path`, no scheme).
 * Reconstruct a fetchable absolute URL for HTTP GET.
 */
export function resolveHttpUrlForFetch(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;

  /* mailto:, tel:, javascript:, etc. — do not prepend https:// */
  if (/^[a-z][a-z0-9+.-]*:/i.test(s) && !/^https?:/i.test(s)) {
    return null;
  }

  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      if (u.protocol === "http:" || u.protocol === "https:") return u.href;
    } catch {
      return null;
    }
  }

  if (s.startsWith("//")) {
    try {
      const u = new URL(`https:${s}`);
      if (u.protocol === "https:") return u.href;
    } catch {
      return null;
    }
  }

  try {
    return new URL(`https://${s}`).href;
  } catch {
    return null;
  }
}

export function normalizeArticleNarrative(value: string, fallbackToOriginal = true): string {
  const normalized = normalizeRssNarrativeText(value);
  return filterLikelyArticleParagraphs(normalized, fallbackToOriginal);
}

export function isLikelyUiChromeParagraph(paragraph: string): boolean {
  const lower = paragraph.toLowerCase();
  if (
    /^(hide captions?|show captions?|toggle captions?|share|save|subscribe|sign in|log in)\b/.test(
      lower
    )
  ) {
    return true;
  }
  if (/^\d+\s+min\s+read\b/.test(lower)) return true;
  if (/^(related|more from|you may also like|recommended)\b/.test(lower)) return true;
  if (/\b(for\s+(npr|ap|reuters|getty(\s+images)?|associated\s+press))\b/i.test(paragraph)) {
    const words = paragraph.split(/\s+/).filter(Boolean).length;
    if (words <= 9) return true;
  }
  if (/^(nasa|image article)$/i.test(paragraph.trim())) return true;
  return false;
}

export function appearsNarrativeParagraph(paragraph: string): boolean {
  if (paragraph.length < 55) return false;
  const sentenceLikeCount = (paragraph.match(/[.!?](\s|$)/g) ?? []).length;
  const wordCount = paragraph.split(/\s+/).filter(Boolean).length;
  if (wordCount < 8) return false;
  if (sentenceLikeCount === 0 && paragraph.length < 140) return false;
  return true;
}

export function filterLikelyArticleParagraphs(
  text: string,
  fallbackToOriginal = true
): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (paragraphs.length === 0) return fallbackToOriginal ? text : "";

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const paragraph of paragraphs) {
    const key = paragraph.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(paragraph);
  }

  const filtered = deduped.filter(
    (paragraph) =>
      !isLikelyUiChromeParagraph(paragraph) && appearsNarrativeParagraph(paragraph)
  );
  if (filtered.length === 0) return fallbackToOriginal ? text : "";
  return filtered.join("\n\n");
}

export async function fetchArticlePlainTextFromUrl(url: string): Promise<string | null> {
  const sourceUrl = resolveHttpUrlForFetch(url);
  if (!sourceUrl) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(sourceUrl, {
      method: "GET",
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.4,*/*;q=0.1",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;

    const html = await response.text();
    if (!html.trim()) return null;
    const clippedHtml =
      html.length > ARTICLE_HTML_MAX_CHARS ? html.slice(0, ARTICLE_HTML_MAX_CHARS) : html;
    const { document } = parseHTML(clippedHtml);
    const article = new Readability(document, { charThreshold: 120 }).parse();
    if (!article?.textContent) return null;
    const normalized = normalizeArticleNarrative(article.textContent, false);
    return normalized || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
