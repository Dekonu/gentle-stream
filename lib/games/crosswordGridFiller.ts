/**
 * Crossword Grid Filler — 5×5 Mini Crossword
 *
 * Picks a random precomputed word square from wordSquares.json and
 * returns it as a FilledGrid ready for Claude to write clues.
 *
 * A word square is a 5×5 grid where every row AND every column is a
 * valid English word — exactly the constraint for a fully-open crossword.
 *
 * The word squares are generated offline by scripts/generate-squares.ts
 * and committed to the repo. No runtime constraint solving needed.
 */

import squares from "./wordSquares.json";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CrosswordSlot {
  number: number;
  row: number;
  col: number;
  direction: "across" | "down";
  length: number;
  answer: string;
}

export interface FilledGrid {
  grid: string[][];         // 5×5 letter grid
  slots: CrosswordSlot[];
  category?: string;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function fillCrosswordGrid(category?: string): FilledGrid | null {
  const pool = (squares as { squares: string[][] }).squares;
  if (!pool || pool.length === 0) return null;

  // Pick a random square
  const rows = pool[Math.floor(Math.random() * pool.length)];

  // Build 5×5 grid
  const grid: string[][] = rows.map(row => row.split(""));

  // Build slots
  const slots: CrosswordSlot[] = [];

  // Across: one per row
  for (let r = 0; r < 5; r++) {
    slots.push({ number: 0, row: r, col: 0, direction: "across", length: 5, answer: rows[r] });
  }

  // Down: one per column
  for (let c = 0; c < 5; c++) {
    const colWord = rows.map(row => row[c]).join("");
    slots.push({ number: 0, row: 0, col: c, direction: "down", length: 5, answer: colWord });
  }

  // Number slots: top-left of each slot in reading order
  numberCrosswordSlots(slots);

  return { grid, slots, category };
}

// ─── Numbering ────────────────────────────────────────────────────────────────

/** Assign standard crossword numbers from unique (row,col) starts, row-major order. */
export function numberCrosswordSlots(slots: CrosswordSlot[]): void {
  // In a fully-open 5×5 grid, every cell at (r,0) starts an across AND every
  // cell at (0,c) starts a down. The top-left corner (0,0) starts both.
  // Standard numbering: left-to-right, top-to-bottom, by starting cell.

  // Cells that start a slot
  const startCells = new Set<string>();
  for (const s of slots) startCells.add(`${s.row},${s.col}`);

  // Sort by row then col
  const sorted = Array.from(startCells).sort((a, b) => {
    const [ar, ac] = a.split(",").map(Number);
    const [br, bc] = b.split(",").map(Number);
    return ar !== br ? ar - br : ac - bc;
  });

  const cellNum = new Map<string, number>();
  sorted.forEach((cell, i) => cellNum.set(cell, i + 1));

  for (const slot of slots) {
    slot.number = cellNum.get(`${slot.row},${slot.col}`) ?? 0;
  }
}
