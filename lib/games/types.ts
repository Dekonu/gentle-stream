/** Puzzle difficulty for algorithmic games (API + UI). */
export type Difficulty = "easy" | "medium" | "hard";

/** JSON shape returned by `/api/game/sudoku` and used by `SudokuCard`. */
export interface SudokuPuzzle {
  given: number[][];
  solution: number[][];
  difficulty: Difficulty;
  givensCount: number;
}

/** Feed / UI game kinds (matches `GameFeedSection` in `lib/types`). */
export type GameType =
  | "sudoku"
  | "killer_sudoku"
  | "word_search"
  | "nonogram"
  | "crossword"
  | "connections"
  | "cryptic"
  | "lateral";
