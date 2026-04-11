const ENGLISH_STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "from",
  "this",
  "are",
  "was",
  "will",
  "has",
  "have",
  "about",
  "into",
]);

const NON_ENGLISH_STOPWORDS = new Set([
  "el",
  "la",
  "los",
  "las",
  "un",
  "una",
  "unos",
  "unas",
  "del",
  "al",
  "que",
  "por",
  "para",
  "con",
  "como",
  "pero",
  "sus",
  "sobre",
  "frente",
  "regresa",
  "tiene",
  "debes",
  "saber",
  "astronautas",
  "retour",
  "avec",
  "dans",
  "pour",
  "des",
  "der",
  "die",
  "und",
  "mit",
  "von",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-zà-ÿ0-9\s'-]/gi, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

export function looksLikelyNonEnglishText(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 45) return false;

  const tokens = tokenize(trimmed).slice(0, 220);
  if (tokens.length < 8) return false;

  let englishHits = 0;
  let nonEnglishHits = 0;
  for (const token of tokens) {
    if (ENGLISH_STOPWORDS.has(token)) englishHits += 1;
    if (NON_ENGLISH_STOPWORDS.has(token)) nonEnglishHits += 1;
  }

  const accentHits = (trimmed.match(/[à-ÿ]/gi) ?? []).length;
  const nonEnglishRatio = nonEnglishHits / tokens.length;
  const englishRatio = englishHits / tokens.length;
  if (accentHits >= 2 && nonEnglishHits >= 2) return true;
  if (nonEnglishHits >= 4 && nonEnglishRatio >= 0.13 && nonEnglishHits > englishHits) return true;
  if (nonEnglishRatio >= 0.2 && englishRatio < 0.08) return true;
  return false;
}
