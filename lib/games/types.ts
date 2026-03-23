// ─── Game types ───────────────────────────────────────────────────────────────

export type GameType =
  | "sudoku"
  | "killer_sudoku"
  | "word_search"
  | "nonogram"
  | "crossword"
  | "connections"
  | "cryptic"
  | "lateral";

export type Difficulty = "easy" | "medium" | "hard";

// ─── Sudoku ───────────────────────────────────────────────────────────────────

export interface SudokuPuzzle {
  given: number[][];
  solution: number[][];
  difficulty: Difficulty;
  givensCount: number;
}

// ─── Word Search ──────────────────────────────────────────────────────────────

export type Direction =
  | "E" | "W" | "N" | "S"
  | "NE" | "NW" | "SE" | "SW";

export interface PlacedWord {
  word: string;
  row: number;         // start row
  col: number;         // start col
  direction: Direction;
  found: boolean;      // client state — has the player found this word?
}

/**
 * A word search puzzle.
 * - `grid`: rows × cols array of uppercase letters
 * - `words`: the words hidden in the grid, with their positions
 * - `theme`: optional category label shown to the player ("Ocean Life", etc.)
 */
export interface WordSearchPuzzle {
  grid: string[][];
  words: PlacedWord[];
  rows: number;
  cols: number;
  theme: string;
  difficulty: Difficulty;
}

// ─── Feed slot ────────────────────────────────────────────────────────────────

export type FeedSectionType = "articles" | "game";

export interface GameFeedSlot {
  sectionType: "game";
  gameType: GameType;
  index: number;
}
