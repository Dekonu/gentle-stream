import type { Article, LayoutVariant } from "@/lib/types";

export interface NewspaperLayoutPlan {
  templateId:
    | "single-hero"
    | "two-columns"
    | "hero-left"
    | "middle-wide"
    | "hero-sidebar";
  layouts: LayoutVariant[];
  residualGapPx: number;
}

interface CandidateTemplate {
  templateId: "hero-left" | "middle-wide" | "hero-sidebar";
  layouts: LayoutVariant[];
  // Group article indices by visual column so we can estimate imbalance.
  columns: number[][];
}

const CANDIDATES: CandidateTemplate[] = [
  {
    templateId: "hero-left",
    layouts: ["hero", "standard", "standard"],
    columns: [[0], [1], [2]],
  },
  {
    templateId: "middle-wide",
    layouts: ["standard", "wide", "standard"],
    columns: [[0], [1], [2]],
  },
  {
    templateId: "hero-sidebar",
    layouts: ["hero", "standard", "standard"],
    columns: [[0], [1, 2]],
  },
];

function scoreTextLength(article: Article): number {
  const headline = article.headline?.length ?? 0;
  const subheadline = article.subheadline?.length ?? 0;
  const body = article.body?.length ?? 0;
  const hasQuote = article.pullQuote?.trim() ? 220 : 0;
  const isRecipe =
    "contentKind" in article && article.contentKind === "recipe";
  const recipeBoost = isRecipe ? 900 : 0;
  const imageBoost =
    "recipeImages" in article && (article.recipeImages?.length ?? 0) > 0
      ? 400
      : article.imagePrompt?.trim()
        ? 300
        : 0;
  const base = headline * 2.2 + subheadline * 1.6 + body * 0.35;
  return base + hasQuote + recipeBoost + imageBoost;
}

function layoutWeight(layout: LayoutVariant): number {
  if (layout === "hero") return 1.35;
  if (layout === "wide") return 1.12;
  return 1;
}

function estimateColumnImbalance(
  articles: Article[],
  candidate: CandidateTemplate
): number {
  const perIndex = articles.map((a, i) => scoreTextLength(a) * layoutWeight(candidate.layouts[i] ?? "standard"));
  const columnScores = candidate.columns.map((indices) =>
    indices.reduce((sum, idx) => sum + (perIndex[idx] ?? 0), 0)
  );
  const max = Math.max(...columnScores);
  const min = Math.min(...columnScores);
  return Math.max(0, max - min);
}

function imbalanceToResidualPx(imbalanceUnits: number): number {
  // Calibrated heuristic; keeps behavior stable across varying article lengths.
  return Math.round(Math.min(520, imbalanceUnits / 13));
}

export function chooseNewspaperLayout(
  articles: Article[],
  sectionIndex: number
): NewspaperLayoutPlan {
  if (articles.length <= 1) {
    return {
      templateId: "single-hero",
      layouts: ["hero"],
      residualGapPx: 0,
    };
  }
  if (articles.length === 2) {
    return {
      templateId: "two-columns",
      layouts: ["standard", "standard"],
      residualGapPx: 0,
    };
  }

  // For 3+ article sections we choose the template that minimizes unused visual space.
  let best = CANDIDATES[sectionIndex % CANDIDATES.length]!;
  let bestImbalance = estimateColumnImbalance(articles, best);

  for (const candidate of CANDIDATES) {
    const score = estimateColumnImbalance(articles, candidate);
    if (score < bestImbalance) {
      best = candidate;
      bestImbalance = score;
    }
  }

  return {
    templateId: best.templateId,
    layouts: best.layouts,
    residualGapPx: imbalanceToResidualPx(bestImbalance),
  };
}
