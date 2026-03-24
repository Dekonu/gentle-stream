/**
 * Fill asymmetric blocked 7×7 patterns with words from the crossword bank (3–7 letters).
 * Backtracking with MRV ordering; words may repeat across slots if the fill requires it.
 */

import { BLOCKED_MINI_PATTERNS } from "./blockedCrosswordPatterns";
import {
  numberCrosswordSlots,
  type CrosswordSlot,
  type FilledGrid,
} from "./crosswordGridFiller";
import {
  BLOCKED_FILL_EXTRA_WORDS,
  BLOCKED_FILL_LONGER_WORDS,
} from "./blockedCrosswordFillLexicon";
import {
  BLOCKED_FILL_SEVEN_LETTER,
  BLOCKED_FILL_SIX_LETTER,
} from "./blockedCrosswordFillSixSeven";
import { getWordBank } from "./crosswordWordList";

const MIN_WORD_LEN = 3;
const MAX_WORD_LEN = 7;

interface SlotWork {
  row: number;
  col: number;
  direction: "across" | "down";
  length: number;
  cells: [number, number][];
}

function shuffleInPlace<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function buildWordsByLength(): Map<number, string[]> {
  const byLen = new Map<number, string[]>();
  const seen = new Set<string>();

  function addWord(w: string): void {
    if (w.length < MIN_WORD_LEN || w.length > MAX_WORD_LEN || seen.has(w)) return;
    seen.add(w);
    if (!byLen.has(w.length)) byLen.set(w.length, []);
    byLen.get(w.length)!.push(w);
  }

  for (const { word } of getWordBank(undefined)) {
    addWord(word.toUpperCase().replace(/[^A-Z]/g, ""));
  }
  for (const w of BLOCKED_FILL_EXTRA_WORDS) {
    addWord(w);
  }
  for (const w of BLOCKED_FILL_LONGER_WORDS) {
    addWord(w);
  }
  for (const w of BLOCKED_FILL_SIX_LETTER) {
    addWord(w);
  }
  for (const w of BLOCKED_FILL_SEVEN_LETTER) {
    addWord(w);
  }

  for (const list of byLen.values()) shuffleInPlace(list);
  return byLen;
}

let cachedWordsByLength: Map<number, string[]> | null = null;

function getWordsByLength(): Map<number, string[]> {
  if (!cachedWordsByLength) cachedWordsByLength = buildWordsByLength();
  return cachedWordsByLength;
}

/** For debugging / smoke tests: how many fill words exist per length. */
export function getBlockedFillLengthCounts(): Record<number, number> {
  const m = getWordsByLength();
  const out: Record<number, number> = {};
  for (const [len, words] of m) out[len] = words.length;
  return out;
}

function isWhite(pattern: string[][], r: number, c: number): boolean {
  return pattern[r][c] === ".";
}

function extractSlots(pattern: string[][]): SlotWork[] {
  const rows = pattern.length;
  const cols = pattern[0]?.length ?? 0;
  const slots: SlotWork[] = [];

  for (let r = 0; r < rows; r++) {
    let c = 0;
    while (c < cols) {
      if (!isWhite(pattern, r, c)) {
        c++;
        continue;
      }
      const start = c;
      while (c < cols && isWhite(pattern, r, c)) c++;
      const len = c - start;
      if (len >= MIN_WORD_LEN) {
        const cells: [number, number][] = [];
        for (let k = 0; k < len; k++) cells.push([r, start + k]);
        slots.push({
          row: r,
          col: start,
          direction: "across",
          length: len,
          cells,
        });
      }
    }
  }

  for (let c = 0; c < cols; c++) {
    let r = 0;
    while (r < rows) {
      if (!isWhite(pattern, r, c)) {
        r++;
        continue;
      }
      const start = r;
      while (r < rows && isWhite(pattern, r, c)) r++;
      const len = r - start;
      if (len >= MIN_WORD_LEN) {
        const cells: [number, number][] = [];
        for (let k = 0; k < len; k++) cells.push([start + k, c]);
        slots.push({
          row: start,
          col: c,
          direction: "down",
          length: len,
          cells,
        });
      }
    }
  }

  return slots;
}

/** '.' empty white, '#' black, single letter A–Z when placed */
type Cell = "." | "#" | string;

function matchesWord(
  grid: Cell[][],
  cells: [number, number][],
  word: string
): boolean {
  for (let i = 0; i < cells.length; i++) {
    const [r, c] = cells[i];
    const ch = grid[r][c];
    if (ch !== "." && ch !== word[i]) return false;
  }
  return true;
}

interface PlaceUndo {
  r: number;
  c: number;
  prev: Cell;
}

function placeWord(
  grid: Cell[][],
  cells: [number, number][],
  word: string
): PlaceUndo[] {
  const undo: PlaceUndo[] = [];
  for (let i = 0; i < cells.length; i++) {
    const [r, c] = cells[i];
    const prev = grid[r][c];
    if (prev === ".") {
      grid[r][c] = word[i]!;
      undo.push({ r, c, prev });
    }
  }
  return undo;
}

function unplaceWord(grid: Cell[][], undo: PlaceUndo[]): void {
  for (const { r, c, prev } of undo) {
    grid[r][c] = prev;
  }
}

const MAX_SEARCH_NODES = 5_000_000;

function candidatesForSlot(
  slot: SlotWork,
  grid: Cell[][],
  wordsByLength: Map<number, string[]>
): string[] {
  const pool = wordsByLength.get(slot.length);
  if (!pool || pool.length === 0) return [];
  return pool.filter((w) => matchesWord(grid, slot.cells, w));
}

/** MRV backtracking: pick the slot with the fewest valid words next. */
function tryFillSlotsMRV(
  unfilled: SlotWork[],
  grid: Cell[][],
  wordsByLength: Map<number, string[]>,
  state: { nodes: number }
): boolean {
  state.nodes++;
  if (state.nodes > MAX_SEARCH_NODES) return false;
  if (unfilled.length === 0) return true;

  let bestIdx = 0;
  let bestCandidates: string[] = [];
  let bestCount = Infinity;

  for (let i = 0; i < unfilled.length; i++) {
    const slot = unfilled[i]!;
    const candidates = candidatesForSlot(slot, grid, wordsByLength);
    if (candidates.length === 0) return false;
    if (candidates.length < bestCount) {
      bestCount = candidates.length;
      bestIdx = i;
      bestCandidates = candidates.slice();
    }
  }

  const slot = unfilled[bestIdx]!;
  const rest = unfilled.filter((_, j) => j !== bestIdx);
  shuffleInPlace(bestCandidates);

  for (const word of bestCandidates) {
    const undo = placeWord(grid, slot.cells, word);
    if (tryFillSlotsMRV(rest, grid, wordsByLength, state)) return true;
    unplaceWord(grid, undo);
  }
  return false;
}

function patternToGrid(lines: string[]): Cell[][] {
  return lines.map((line) =>
    line.split("").map((ch) => (ch === "#" ? "#" : "."))
  );
}

function gridToDisplay(grid: Cell[][]): string[][] {
  return grid.map((row) =>
    row.map((cell) => (cell === "#" ? "#" : (cell as string)))
  );
}

function fillPatternLines(
  lines: string[],
  wordsByLength: Map<number, string[]>
): FilledGrid | null {
  const patternChars = lines.map((line) => line.split(""));
  const slotWorks = extractSlots(patternChars);
  if (slotWorks.length === 0) return null;

  const grid = patternToGrid(lines);
  const search = { nodes: 0 };

  if (!tryFillSlotsMRV(slotWorks, grid, wordsByLength, search)) return null;

  const slots: CrosswordSlot[] = slotWorks.map((sw) => {
    const answer = sw.cells.map(([r, c]) => grid[r][c] as string).join("");
    return {
      number: 0,
      row: sw.row,
      col: sw.col,
      direction: sw.direction,
      length: sw.length,
      answer,
    };
  });
  numberCrosswordSlots(slots);

  return {
    grid: gridToDisplay(grid),
    slots,
  };
}

/**
 * Attempt to produce a filled blocked mini for a random pattern (retries across patterns).
 */
export function tryGenerateBlockedCrossword(): FilledGrid | null {
  const wordsByLength = getWordsByLength();
  const patternIndices = BLOCKED_MINI_PATTERNS.map((_, i) => i);
  shuffleInPlace(patternIndices);

  for (const pi of patternIndices) {
    const lines = BLOCKED_MINI_PATTERNS[pi]!;
    const filled = fillPatternLines(lines, wordsByLength);
    if (filled) return filled;
  }

  return null;
}

/** Smoke: try one specific 7×7 pattern (array of row strings). */
export function tryGenerateBlockedFromLines(lines: string[]): FilledGrid | null {
  return fillPatternLines(lines, getWordsByLength());
}
