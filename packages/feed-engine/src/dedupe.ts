import type { Article } from "@gentle-stream/domain/types";

function stripInlineHtmlModifiers(text: string): string {
  if (!text) return "";
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(
      /<\/?(em|strong|b|i|u|mark|small|sub|sup|code|kbd|samp|var|abbr|dfn|cite|span|time|q|ins|del|a)[^>]*>/gi,
      ""
    )
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function cleanArticleForFeed(article: Article): Article {
  return {
    ...article,
    body: stripInlineHtmlModifiers(article.body ?? ""),
    pullQuote: stripInlineHtmlModifiers(article.pullQuote ?? ""),
    subheadline: stripInlineHtmlModifiers(article.subheadline ?? ""),
    headline: stripInlineHtmlModifiers(article.headline ?? ""),
    sourceUrls: article.sourceUrls ?? [],
  };
}

export function articleUniqKey(article: Article): string {
  if ("id" in article && typeof article.id === "string" && article.id.length > 0) {
    return `id:${article.id}`;
  }
  return `raw:${article.category}|${article.headline}|${article.byline}|${article.location}`;
}
