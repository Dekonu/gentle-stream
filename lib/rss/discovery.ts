import { listEnabledRssFeeds, recordRssFeedHealth } from "@/lib/db/rssFeeds";
import { normaliseUrl } from "@/lib/db/articles";

export interface RssDiscoveryCandidate {
  headline: string;
  sourceUrl: string;
  rationale: string;
}

interface RssItem {
  title: string;
  link: string;
  publishedAt: string | null;
}

interface DiscoverFromRssInput {
  categoryHint?: string;
  targetLocale?: string;
  targetCount: number;
  seenUrls: string[];
  seenHeadlines: string[];
}

const FETCH_TIMEOUT_MS = 8_000;
const MAX_COMMON_PATH_CHECKS = 6;
const DEFAULT_MAX_FEEDS = 10;
const DEFAULT_ITEMS_PER_FEED = 8;

function cleanXmlText(value: string): string {
  return value
    .replace(/^<!\[CDATA\[/, "")
    .replace(/\]\]>$/, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block: string, tagName: string): string | null {
  const match = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i").exec(block);
  if (match?.[1]) return cleanXmlText(match[1]);
  return null;
}

function extractAtomLink(entry: string): string | null {
  const m = /<link[^>]+href=["']([^"']+)["'][^>]*>/i.exec(entry);
  if (!m?.[1]) return null;
  return m[1].trim();
}

function parseRssItems(xml: string): RssItem[] {
  const itemBlocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  if (itemBlocks.length > 0) {
    return itemBlocks
      .map((item) => {
        const title = extractTag(item, "title") ?? "";
        const link = extractTag(item, "link") ?? "";
        const publishedAt = extractTag(item, "pubDate");
        return { title, link, publishedAt };
      })
      .filter((item) => item.title && item.link);
  }

  const atomBlocks = xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
  return atomBlocks
    .map((entry) => {
      const title = extractTag(entry, "title") ?? "";
      const link = extractAtomLink(entry) ?? "";
      const publishedAt = extractTag(entry, "updated") ?? extractTag(entry, "published");
      return { title, link, publishedAt };
    })
    .filter((item) => item.title && item.link);
}

async function fetchText(url: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.1",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function looksLikeFeedXml(text: string): boolean {
  const lowered = text.toLowerCase();
  return lowered.includes("<rss") || lowered.includes("<feed") || lowered.includes("<rdf:rdf");
}

function discoverAlternateFeedLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const matches = html.match(/<link[^>]+>/gi) ?? [];
  for (const tag of matches) {
    if (!/rel=["'][^"']*alternate/i.test(tag)) continue;
    if (!/type=["'](?:application\/rss\+xml|application\/atom\+xml|application\/xml|text\/xml)["']/i.test(tag))
      continue;
    const hrefMatch = /href=["']([^"']+)["']/i.exec(tag);
    if (!hrefMatch?.[1]) continue;
    try {
      out.add(new URL(hrefMatch[1], baseUrl).toString());
    } catch {
      // ignore invalid URLs
    }
  }
  return Array.from(out);
}

async function resolveFeedEndpoint(candidateUrl: string): Promise<string> {
  const normalized = candidateUrl.trim();
  const firstBody = await fetchText(normalized);
  if (looksLikeFeedXml(firstBody)) return normalized;

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(normalized);
  } catch {
    throw new Error("Invalid URL");
  }

  const alternates = discoverAlternateFeedLinks(firstBody, normalized);
  for (const alt of alternates) {
    const body = await fetchText(alt);
    if (looksLikeFeedXml(body)) return alt;
  }

  const base = `${parsedUrl.protocol}//${parsedUrl.host}`;
  const commonPaths = ["/feed", "/rss", "/rss.xml", "/feed.xml", "/feeds/all.rss.xml", "/feeds/posts/default"];
  for (const path of commonPaths.slice(0, MAX_COMMON_PATH_CHECKS)) {
    try {
      const possible = `${base}${path}`;
      const body = await fetchText(possible);
      if (looksLikeFeedXml(body)) return possible;
    } catch {
      // keep trying
    }
  }

  throw new Error("Could not resolve RSS/Atom endpoint");
}

function isRecentEnough(isoLike: string | null): boolean {
  if (!isoLike) return true;
  const ms = Date.parse(isoLike);
  if (!Number.isFinite(ms)) return true;
  const ageMs = Date.now() - ms;
  return ageMs <= 30 * 24 * 60 * 60 * 1000;
}

export async function discoverCandidatesFromRss(input: DiscoverFromRssInput): Promise<RssDiscoveryCandidate[]> {
  const maxFeeds = Math.max(1, Math.min(20, Number(process.env.RSS_DISCOVERY_MAX_FEEDS ?? DEFAULT_MAX_FEEDS)));
  const itemsPerFeed = Math.max(
    1,
    Math.min(20, Number(process.env.RSS_DISCOVERY_ITEMS_PER_FEED ?? DEFAULT_ITEMS_PER_FEED))
  );
  const feeds = await listEnabledRssFeeds({
    localeHint: input.targetLocale,
    categoryHint: input.categoryHint,
    limit: maxFeeds,
  });
  const seenUrlSet = new Set(input.seenUrls.map((url) => normaliseUrl(url)));
  const seenHeadlineSet = new Set(input.seenHeadlines.map((headline) => headline.trim().toLowerCase()));
  const candidates: RssDiscoveryCandidate[] = [];

  for (const feed of feeds) {
    if (candidates.length >= input.targetCount) break;
    try {
      const feedEndpoint = await resolveFeedEndpoint(feed.feedUrl);
      const xml = await fetchText(feedEndpoint);
      const items = parseRssItems(xml).slice(0, itemsPerFeed);
      let acceptedFromFeed = 0;
      for (const item of items) {
        if (acceptedFromFeed >= itemsPerFeed || candidates.length >= input.targetCount) break;
        if (!isRecentEnough(item.publishedAt)) continue;
        const normalizedUrl = normaliseUrl(item.link);
        const normalizedHeadline = item.title.trim().toLowerCase();
        if (!normalizedUrl || !normalizedHeadline) continue;
        if (seenUrlSet.has(normalizedUrl) || seenHeadlineSet.has(normalizedHeadline)) continue;
        seenUrlSet.add(normalizedUrl);
        seenHeadlineSet.add(normalizedHeadline);
        acceptedFromFeed += 1;
        candidates.push({
          headline: item.title.trim(),
          sourceUrl: item.link.trim(),
          rationale: `RSS feed: ${feed.publisher || feed.label || feed.feedUrl}`,
        });
      }
      await recordRssFeedHealth({ id: feed.id, ok: true });
    } catch (error: unknown) {
      await recordRssFeedHealth({
        id: feed.id,
        ok: false,
        errorMessage: error instanceof Error ? error.message : "RSS fetch failed",
      });
    }
  }

  return candidates.slice(0, input.targetCount);
}

