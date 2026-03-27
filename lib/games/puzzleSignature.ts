import { createHash } from "crypto";
import type {
  CrosswordPuzzle,
  KillerSudokuPuzzle,
  NonogramPuzzle,
  SudokuPuzzle,
} from "./types";

function hash(payload: string): string {
  return createHash("sha256").update(payload).digest("hex").slice(0, 24);
}

export function makeSudokuSignature(puzzle: SudokuPuzzle): string {
  const given = puzzle.given.map((r) => r.join("")).join("|");
  const solution = puzzle.solution.map((r) => r.join("")).join("|");
  return `sdk_${hash(`${puzzle.difficulty}|${given}|${solution}`)}`;
}

export function makeKillerSudokuSignature(puzzle: KillerSudokuPuzzle): string {
  const solution = puzzle.solution.map((r) => r.join("")).join("|");
  const cages = [...puzzle.cages]
    .map((c) => {
      const cells = [...c.cells]
        .map(([r, col]) => `${r},${col}`)
        .sort()
        .join(";");
      return `${c.id}:${c.sum}:${cells}`;
    })
    .sort()
    .join("|");
  return `ksdk_${hash(`${puzzle.difficulty}|${solution}|${cages}`)}`;
}

export function makeNonogramSignature(puzzle: NonogramPuzzle): string {
  const solution = puzzle.solution
    .map((r) => r.map((v) => (v ? "1" : "0")).join(""))
    .join("|");
  return `nng_${hash(`${puzzle.difficulty}|${puzzle.rows}x${puzzle.cols}|${solution}`)}`;
}

export function makeCrosswordSignature(puzzle: CrosswordPuzzle): string {
  const slots = [...puzzle.slots]
    .map((s) => `${s.number}-${s.direction}-${s.answer.toUpperCase()}`)
    .sort()
    .join("|");
  return `cwd_${hash(`${puzzle.category}|${slots}`)}`;
}
