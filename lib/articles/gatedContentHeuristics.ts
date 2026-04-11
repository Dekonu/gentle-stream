const GATED_PHRASE_PATTERNS: Array<{ label: string; pattern: RegExp; weight: number }> = [
  { label: "sign_in", pattern: /\b(sign in|log in)\b.{0,32}\b(read|continue|view|access)\b/i, weight: 2.5 },
  { label: "subscribe_to_read", pattern: /\b(subscribe|subscription)\b.{0,24}\b(read|continue|article|content)\b/i, weight: 2.5 },
  { label: "account_required", pattern: /\b(create|register|free account)\b.{0,24}\b(continue|read|access)\b/i, weight: 2.2 },
  { label: "members_only", pattern: /\b(members?|subscribers?)\b.{0,16}\b(only|exclusive)\b/i, weight: 2.2 },
];

const TEASER_PATTERNS: Array<{ label: string; pattern: RegExp; weight: number }> = [
  { label: "read_more_prompt", pattern: /\b(read more|continue reading|view full article)\b/i, weight: 1.2 },
  { label: "related_story_list", pattern: /\b(related stories|more from|you may also like|recommended)\b/i, weight: 1.0 },
];

export interface GatedContentAssessmentInput {
  headline: string;
  subheadline?: string | null;
  body: string;
}

export interface GatedContentAssessment {
  isLikelyGated: boolean;
  score: number;
  reasons: string[];
  suggestedQualityScore: number;
}

function countSentenceLikeParagraphs(body: string): number {
  return body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => /[.!?](\s|$)/.test(part) && part.split(/\s+/).length >= 9).length;
}

function normalizedText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function bodyLooksTooCloseToSummary(body: string, summary: string): boolean {
  const bodyNorm = normalizedText(body);
  const summaryNorm = normalizedText(summary);
  if (!bodyNorm || !summaryNorm) return false;
  if (bodyNorm.length < 140 && bodyNorm.includes(summaryNorm.slice(0, Math.min(80, summaryNorm.length))))
    return true;
  return false;
}

export function assessGatedContent(input: GatedContentAssessmentInput): GatedContentAssessment {
  const body = input.body.trim();
  const summary = (input.subheadline ?? "").trim();
  const reasons: string[] = [];
  let score = 0;

  for (const signal of GATED_PHRASE_PATTERNS) {
    if (!signal.pattern.test(body)) continue;
    score += signal.weight;
    reasons.push(signal.label);
  }

  for (const signal of TEASER_PATTERNS) {
    if (!signal.pattern.test(body)) continue;
    score += signal.weight;
    reasons.push(signal.label);
  }

  const linkCount = (body.match(/https?:\/\/\S+/gi) ?? []).length;
  if (linkCount >= 3) {
    score += 1.3;
    reasons.push("high_link_density");
  }

  const sentenceLikeParagraphs = countSentenceLikeParagraphs(body);
  if (body.length < 480 && sentenceLikeParagraphs <= 1) {
    score += 1.6;
    reasons.push("short_non_narrative_body");
  }

  if (bodyLooksTooCloseToSummary(body, summary)) {
    score += 1.2;
    reasons.push("body_close_to_summary");
  }

  const isLikelyGated = score >= 3.1;
  const suggestedQualityScore = isLikelyGated ? 0.2 : 0.5;

  return {
    isLikelyGated,
    score: Number(score.toFixed(2)),
    reasons,
    suggestedQualityScore,
  };
}
