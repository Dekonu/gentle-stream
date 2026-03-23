/**
 * Sudoku Generator
 *
 * Generates a valid 9×9 Sudoku puzzle with a unique solution.
 * Pure TypeScript — no dependencies, no API calls, runs in ~1–5ms.
 *
 * Algorithm:
 *   1. Fill the diagonal 3×3 boxes first (they don't constrain each other)
 *   2. Solve the rest with backtracking
 *   3. Remove cells one by one, checking uniqueness after each removal
 *      until the target given count is reached
 *
 * Difficulty is controlled by the number of given (pre-filled) cells:
 *   easy:   36–40 givens  (many hints, straightforward logic)
 *   medium: 28–35 givens  (requires some inference chains)
 *   hard:   22–27 givens  (requires advanced techniques)
 */

import type { SudokuPuzzle, Difficulty } from "./types";

// ─── Constants ────────────────────────────────────────────────────────────────

const SIZE = 9;
const BOX = 3;

const GIVENS_RANGE: Record<Difficulty, [number, number]> = {
  easy:   [36, 40],
  medium: [28, 35],
  hard:   [22, 27],
};

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateSudoku(difficulty: Difficulty = "medium"): SudokuPuzzle {
  const solution = createSolvedGrid();
  const [min, max] = GIVENS_RANGE[difficulty];
  const targetGivens = randInt(min, max);
  const given = createPuzzle(solution, targetGivens);

  return {
    given,
    solution,
    difficulty,
    givensCount: countGivens(given),
  };
}

// ─── Grid creation ────────────────────────────────────────────────────────────

function emptyGrid(): number[][] {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function copyGrid(grid: number[][]): number[][] {
  return grid.map((row) => [...row]);
}

function countGivens(grid: number[][]): number {
  return grid.flat().filter((n) => n !== 0).length;
}

/**
 * Create a fully solved valid Sudoku grid.
 * Fills the three diagonal boxes first (independent of each other),
 * then solves the rest via backtracking.
 */
function createSolvedGrid(): number[][] {
  const grid = emptyGrid();

  // Fill the three diagonal 3×3 boxes
  for (let box = 0; box < SIZE; box += BOX) {
    fillBox(grid, box, box);
  }

  // Solve the remaining cells
  solve(grid);

  return grid;
}

/** Fill a 3×3 box at (row, col) with a random permutation of 1–9 */
function fillBox(grid: number[][], row: number, col: number): void {
  const nums = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  let i = 0;
  for (let r = row; r < row + BOX; r++) {
    for (let c = col; c < col + BOX; c++) {
      grid[r][c] = nums[i++];
    }
  }
}

// ─── Solver ───────────────────────────────────────────────────────────────────

/**
 * Standard backtracking solver.
 * Returns true if the grid was solved successfully.
 */
function solve(grid: number[][]): boolean {
  const cell = findEmpty(grid);
  if (!cell) return true; // no empty cells — solved

  const [row, col] = cell;
  const candidates = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);

  for (const num of candidates) {
    if (isValid(grid, row, col, num)) {
      grid[row][col] = num;
      if (solve(grid)) return true;
      grid[row][col] = 0;
    }
  }

  return false; // backtrack
}

/**
 * Count the number of solutions for a grid.
 * We only need to know if the count is 0, 1, or >1, so we stop at 2.
 */
function countSolutions(grid: number[][], limit = 2): number {
  const cell = findEmpty(grid);
  if (!cell) return 1; // complete — one solution found

  const [row, col] = cell;
  let count = 0;

  for (let num = 1; num <= SIZE; num++) {
    if (isValid(grid, row, col, num)) {
      grid[row][col] = num;
      count += countSolutions(grid, limit);
      grid[row][col] = 0;
      if (count >= limit) return count; // early exit once we hit the limit
    }
  }

  return count;
}

// ─── Puzzle creation ──────────────────────────────────────────────────────────

/**
 * Start from a solved grid and remove cells one by one.
 * After each removal, verify the puzzle still has a unique solution.
 * Stop when the given count reaches the target.
 */
function createPuzzle(solution: number[][], targetGivens: number): number[][] {
  const puzzle = copyGrid(solution);
  const positions = shuffle(allPositions());
  let removed = 0;
  const target = SIZE * SIZE - targetGivens;

  for (const [row, col] of positions) {
    if (removed >= target) break;

    const backup = puzzle[row][col];
    puzzle[row][col] = 0;

    // Check uniqueness — if more than 1 solution exists, restore the cell
    const test = copyGrid(puzzle);
    if (countSolutions(test) !== 1) {
      puzzle[row][col] = backup;
    } else {
      removed++;
    }
  }

  return puzzle;
}

// ─── Validation ───────────────────────────────────────────────────────────────

function isValid(grid: number[][], row: number, col: number, num: number): boolean {
  // Check row
  if (grid[row].includes(num)) return false;

  // Check column
  for (let r = 0; r < SIZE; r++) {
    if (grid[r][col] === num) return false;
  }

  // Check 3×3 box
  const boxRow = Math.floor(row / BOX) * BOX;
  const boxCol = Math.floor(col / BOX) * BOX;
  for (let r = boxRow; r < boxRow + BOX; r++) {
    for (let c = boxCol; c < boxCol + BOX; c++) {
      if (grid[r][c] === num) return false;
    }
  }

  return true;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function findEmpty(grid: number[][]): [number, number] | null {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === 0) return [r, c];
    }
  }
  return null;
}

function allPositions(): [number, number][] {
  const positions: [number, number][] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      positions.push([r, c]);
    }
  }
  return positions;
}

/** Fisher-Yates shuffle — returns a new shuffled array */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
