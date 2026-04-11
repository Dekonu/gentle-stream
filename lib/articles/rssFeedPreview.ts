const RSS_BODY_FOOTER_MARKER =
  "This report is sourced directly from the original RSS item";

const DEFAULT_EXCERPT_CHARS = 420;

interface FeedPreviewArticleShape {
  source?: string;
  contentKind?: string;
  subheadline?: string | null;
  body?: string | null;
}

function stripRssFooter(body: string): string {
  const markerIndex = body.indexOf(RSS_BODY_FOOTER_MARKER);
  if (markerIndex === -1) return body.trim();
  return body.slice(0, markerIndex).trim();
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function trimToSentence(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const limited = text.slice(0, maxChars).trimEnd();
  const sentenceBreak = Math.max(
    limited.lastIndexOf(". "),
    limited.lastIndexOf("! "),
    limited.lastIndexOf("? ")
  );
  if (sentenceBreak >= Math.floor(maxChars * 0.55)) {
    return `${limited.slice(0, sentenceBreak + 1).trimEnd()}…`;
  }
  return `${limited}…`;
}

export function isRssNarrativeArticle(article: FeedPreviewArticleShape): boolean {
  if (article.contentKind === "recipe") return false;
  if (article.source != null && article.source !== "ingest") return false;
  const body = article.body?.trim() ?? "";
  if (!body) return false;
  return body.includes(RSS_BODY_FOOTER_MARKER);
}

export function buildRssFeedExcerpt(
  article: FeedPreviewArticleShape,
  maxChars = DEFAULT_EXCERPT_CHARS
): string {
  const body = collapseWhitespace(stripRssFooter(article.body ?? ""));
  if (body) return trimToSentence(body, Math.max(120, maxChars));

  const subheadline = collapseWhitespace(article.subheadline ?? "");
  if (!subheadline) return "";
  return trimToSentence(subheadline, Math.max(120, maxChars));
}

function comparableExcerpt(text: string): string {
  return collapseWhitespace(text).replace(/…+$/u, "").trim();
}

export function rssHasExtraContentBeyondExcerpt(
  article: FeedPreviewArticleShape,
  maxChars = DEFAULT_EXCERPT_CHARS
): boolean {
  const full = collapseWhitespace(stripRssFooter(article.body ?? ""));
  if (!full) return false;

  const excerpt = buildRssFeedExcerpt(article, maxChars);
  if (!excerpt) return false;

  const excerptComparable = comparableExcerpt(excerpt);
  if (!excerptComparable) return false;
  if (full.length <= excerptComparable.length + 24) return false;

  const fullLower = full.toLowerCase();
  const excerptLower = excerptComparable.toLowerCase();
  if (fullLower.startsWith(excerptLower) && full.length - excerptComparable.length < 40) {
    return false;
  }

  return true;
}
