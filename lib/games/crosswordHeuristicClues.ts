/**
 * Crossword clues without LLM calls: Wiktionary extracts (web) + Datamuse synonyms (API).
 * Grids remain algorithmic; this only fills the clue strings for pool + live routes.
 */

import {
  canonicalizeClueKeys,
  clueLeaksAnswer,
  slotClueMapKey,
} from "./crosswordClueMerge";
import type { CrosswordSlot } from "./crosswordGridFiller";

const WIKI_API = "https://en.wiktionary.org/w/api.php";
const DATAMUSE = "https://api.datamuse.com/words";

const UA =
  "GentleStream/1.0 (crossword heuristic clues; open-source; +https://github.com/)";

function wikiTitleCase(answer: string): string {
  const w = answer.trim().toLowerCase();
  if (!w) return answer;
  if (w.includes(" ")) {
    return w
      .split(/\s+/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join("_");
  }
  return w.charAt(0).toUpperCase() + w.slice(1);
}

function normalizeAnswerKey(answer: string): string {
  return answer.toUpperCase().replace(/\s+/g, "");
}

function glossFromExtract(extract: string): string {
  const t = extract.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const cut = t.split(/\n/)[0] ?? t;
  const sentence = cut.split(/(?<=[.!?])\s+/)[0] ?? cut;
  return sentence.trim().slice(0, 280);
}

function sanitizeClue(raw: string, answer: string): string {
  let t = raw.replace(/\s+/g, " ").trim();
  if (!t) return "";
  const esc = answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(esc, "gi");
  t = t.replace(re, "___");
  t = t.replace(/\s*___\s*/g, " ");
  t = t.replace(/^\W+/, "").trim();
  if (t.length > 130) t = `${t.slice(0, 127)}…`;
  if (t.length < 6) return "";
  const first = t.charAt(0).toUpperCase();
  return first + t.slice(1);
}

function fallbackClue(slot: CrosswordSlot): string {
  return `Common English word (${slot.length} letters)`;
}

async function datamuseSynonymClue(answer: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${DATAMUSE}?rel_syn=${encodeURIComponent(answer.toLowerCase())}&max=8`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { word?: string }[];
    if (!Array.isArray(rows)) return null;
    const ans = answer.toLowerCase();
    for (const row of rows) {
      const w = row.word?.trim();
      if (!w || w.toLowerCase() === ans) continue;
      return `Synonym often used: ${w}`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function datamuseMeansLikeClue(answer: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${DATAMUSE}?ml=${encodeURIComponent(answer.toLowerCase())}&max=5`,
      { headers: { Accept: "application/json" } }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as { word?: string }[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const w = rows[0]?.word;
    if (!w || w.toLowerCase() === answer.toLowerCase()) return null;
    return `Word in the same semantic field: ${w}`;
  } catch {
    return null;
  }
}

async function wiktionaryGlossByAnswer(
  answers: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(answers.map(normalizeAnswerKey))].filter(Boolean);
  const chunkSize = 12;

  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const titles = chunk.map((a) => wikiTitleCase(a)).join("|");
    const params = new URLSearchParams({
      action: "query",
      prop: "extracts",
      exintro: "1",
      explaintext: "1",
      redirects: "1",
      format: "json",
    });
    params.set("titles", titles);

    try {
      const res = await fetch(`${WIKI_API}?${params.toString()}`, {
        headers: { "User-Agent": UA },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as {
        query?: {
          pages?: Record<
            string,
            { title?: string; extract?: string; missing?: boolean }
          >;
        };
      };
      const pages = json.query?.pages;
      if (!pages) continue;
      for (const page of Object.values(pages)) {
        if (!page || page.missing || !page.extract || !page.title) continue;
        const key = normalizeAnswerKey(page.title.replace(/_/g, " "));
        const gloss = glossFromExtract(page.extract);
        if (gloss) out.set(key, gloss);
      }
    } catch {
      /* network */
    }
    if (i + chunkSize < unique.length) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  return out;
}

export interface HeuristicClueOptions {
  batchDelayMs?: number;
}

/**
 * Build per-slot clue map (keys like "1-across") using Wiktionary + Datamuse heuristics.
 * Does not call Anthropic.
 */
export async function fetchCrosswordCluesHeuristic(
  slots: CrosswordSlot[],
  _category: string,
  _options?: HeuristicClueOptions
): Promise<Record<string, string>> {
  const answers = slots.map((s) => s.answer);
  const glossMap = await wiktionaryGlossByAnswer(answers);

  const rawBySlotKey: Record<string, string> = {};

  for (const slot of slots) {
    const keyAns = normalizeAnswerKey(slot.answer);
    let gloss = glossMap.get(keyAns);
    let clue = gloss ? sanitizeClue(gloss, slot.answer) : "";

    if (!clue || clueLeaksAnswer(slot, clue)) {
      const syn = await datamuseSynonymClue(slot.answer);
      clue = syn ? sanitizeClue(syn, slot.answer) : "";
    }
    if (!clue || clueLeaksAnswer(slot, clue)) {
      const ml = await datamuseMeansLikeClue(slot.answer);
      clue = ml ? sanitizeClue(ml, slot.answer) : "";
    }
    if (!clue || clueLeaksAnswer(slot, clue)) {
      clue = fallbackClue(slot);
    }
    rawBySlotKey[slotClueMapKey(slot)] = clue;
  }

  return canonicalizeClueKeys(rawBySlotKey);
}

/** When true, use Anthropic for clues (legacy). Default: heuristic only. */
export function crosswordCluesPreferAnthropic(): boolean {
  const v = process.env.CROSSWORD_CLUES_SOURCE?.trim().toLowerCase();
  return v === "anthropic" || v === "claude";
}
