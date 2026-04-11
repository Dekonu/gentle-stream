import { NextRequest, NextResponse } from "next/server";
import { API_ERROR_CODES, apiErrorResponse } from "@/lib/api/errors";
import { translateTextsWithDeepL } from "@/lib/translation/deepl";

interface TranslateArticleRequestBody {
  articleId?: string;
  headline?: string;
  subheadline?: string;
  body?: string;
}

interface TranslateArticleResponseBody {
  available: boolean;
  translated: boolean;
  detectedSourceLanguage: string | null;
  headline: string;
  subheadline: string;
  body: string;
}

const MAX_FIELD_CHARS = 45_000;
const translationCache = new Map<string, TranslateArticleResponseBody>();

function trimField(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function buildCacheKey(input: {
  articleId: string;
  headline: string;
  subheadline: string;
  body: string;
}): string {
  return [
    input.articleId,
    input.headline.slice(0, 160),
    input.subheadline.slice(0, 160),
    input.body.slice(0, 320),
    input.headline.length,
    input.subheadline.length,
    input.body.length,
  ].join("|");
}

export async function POST(request: NextRequest) {
  let payload: TranslateArticleRequestBody;
  try {
    payload = (await request.json()) as TranslateArticleRequestBody;
  } catch {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: "Expected a JSON request body.",
    });
  }

  const articleId = trimField(payload.articleId) || "ad-hoc";
  const headline = trimField(payload.headline).slice(0, MAX_FIELD_CHARS);
  const subheadline = trimField(payload.subheadline).slice(0, MAX_FIELD_CHARS);
  const body = trimField(payload.body).slice(0, MAX_FIELD_CHARS);

  if (!headline && !subheadline && !body) {
    return apiErrorResponse({
      request,
      status: 400,
      code: API_ERROR_CODES.VALIDATION,
      message: "headline, subheadline, or body is required.",
    });
  }

  const cacheKey = buildCacheKey({ articleId, headline, subheadline, body });
  const cached = translationCache.get(cacheKey);
  if (cached) return NextResponse.json(cached);

  try {
    const deepl = await translateTextsWithDeepL({
      texts: [headline, subheadline, body],
      targetLang: "EN",
    });

    if (!deepl) {
      const passthrough: TranslateArticleResponseBody = {
        available: false,
        translated: false,
        detectedSourceLanguage: null,
        headline,
        subheadline,
        body,
      };
      translationCache.set(cacheKey, passthrough);
      return NextResponse.json(passthrough);
    }

    const translatedHeadline = deepl.texts[0] ?? headline;
    const translatedSubheadline = deepl.texts[1] ?? subheadline;
    const translatedBody = deepl.texts[2] ?? body;
    const sourceLanguage = deepl.detectedSourceLanguage?.toUpperCase() ?? null;
    const translated = Boolean(sourceLanguage && !sourceLanguage.startsWith("EN"));

    const out: TranslateArticleResponseBody = {
      available: true,
      translated,
      detectedSourceLanguage: sourceLanguage,
      headline: translated ? translatedHeadline : headline,
      subheadline: translated ? translatedSubheadline : subheadline,
      body: translated ? translatedBody : body,
    };
    translationCache.set(cacheKey, out);
    if (translationCache.size > 300) {
      const oldest = translationCache.keys().next().value as string | undefined;
      if (oldest) translationCache.delete(oldest);
    }
    return NextResponse.json(out);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Could not translate article.";
    return apiErrorResponse({
      request,
      status: 502,
      code: API_ERROR_CODES.INTERNAL,
      message,
    });
  }
}
