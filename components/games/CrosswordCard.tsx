"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { Difficulty } from "@/lib/games/types";
import type { CrosswordPuzzle } from "@/lib/games/crosswordIngestAgent";
import type { CrosswordSlot } from "@/lib/games/crosswordGridFiller";

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotWithClue = CrosswordSlot & { clue: string };

interface BoardState {
  letters: string[][];          // player's entries, "" = empty
  selected: { row: number; col: number } | null;
  activeSlot: SlotWithClue | null;
  completed: boolean;
  startedAt: number | null;
  elapsedSecs: number;
  revealed: Set<string>;        // "r,c" cells the player revealed
  checked: boolean;             // whether errors are currently shown
  errors: boolean[][];          // cells that are wrong (after check)
}

type Action =
  | { type: "SELECT_CELL"; row: number; col: number }
  | { type: "TYPE"; letter: string }
  | { type: "ERASE" }
  | { type: "TICK" }
  | { type: "CHECK" }
  | { type: "REVEAL_WORD" }
  | { type: "REVEAL_ALL" }
  | { type: "RESET" };

interface CrosswordCardProps {
  puzzle: CrosswordPuzzle;
  onNewPuzzle?: (difficulty: Difficulty) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function makeEmpty(rows: number, cols: number): string[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(""));
}

function makeEmptyBool(rows: number, cols: number): boolean[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(false));
}

/** Find which slot should be active for a given cell (prefers current direction) */
function findSlot(
  slots: SlotWithClue[],
  row: number,
  col: number,
  preferDirection: "across" | "down" | null
): SlotWithClue | null {
  const matching = slots.filter((s) => cellInSlot(s, row, col));
  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0];
  if (preferDirection) {
    const preferred = matching.find((s) => s.direction === preferDirection);
    if (preferred) return preferred;
  }
  return matching[0];
}

function cellInSlot(slot: SlotWithClue, row: number, col: number): boolean {
  const dr = slot.direction === "down" ? 1 : 0;
  const dc = slot.direction === "across" ? 1 : 0;
  for (let i = 0; i < slot.length; i++) {
    if (slot.row + dr * i === row && slot.col + dc * i === col) return true;
  }
  return false;
}

function nextEmpty(
  letters: string[][],
  slot: SlotWithClue
): [number, number] | null {
  const dr = slot.direction === "down" ? 1 : 0;
  const dc = slot.direction === "across" ? 1 : 0;
  for (let i = 0; i < slot.length; i++) {
    const r = slot.row + dr * i;
    const c = slot.col + dc * i;
    if (!letters[r][c]) return [r, c];
  }
  return null;
}

function isComplete(
  letters: string[][],
  puzzle: CrosswordPuzzle
): boolean {
  for (const slot of puzzle.slots) {
    const dr = slot.direction === "down" ? 1 : 0;
    const dc = slot.direction === "across" ? 1 : 0;
    for (let i = 0; i < slot.length; i++) {
      const r = slot.row + dr * i;
      const c = slot.col + dc * i;
      if (letters[r]?.[c] !== slot.answer[i]) return false;
    }
  }
  return true;
}

function computeErrors(
  letters: string[][],
  puzzle: CrosswordPuzzle
): boolean[][] {
  const errors = makeEmptyBool(puzzle.grid.length, puzzle.grid[0].length);
  for (const slot of puzzle.slots) {
    const dr = slot.direction === "down" ? 1 : 0;
    const dc = slot.direction === "across" ? 1 : 0;
    for (let i = 0; i < slot.length; i++) {
      const r = slot.row + dr * i;
      const c = slot.col + dc * i;
      if (letters[r]?.[c] && letters[r][c] !== slot.answer[i]) {
        errors[r][c] = true;
      }
    }
  }
  return errors;
}

function makeInitialState(puzzle: CrosswordPuzzle): BoardState {
  return {
    letters: makeEmpty(puzzle.grid.length, puzzle.grid[0].length),
    selected: null,
    activeSlot: null,
    completed: false,
    startedAt: null,
    elapsedSecs: 0,
    revealed: new Set(),
    checked: false,
    errors: makeEmptyBool(puzzle.grid.length, puzzle.grid[0].length),
  };
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

function reducer(
  state: BoardState,
  action: Action,
  puzzle: CrosswordPuzzle
): BoardState {
  switch (action.type) {
    case "SELECT_CELL": {
      const { row, col } = action;
      if (puzzle.grid[row]?.[col] === "#") return state;

      // Toggle direction if same cell clicked twice
      const currentDir = state.activeSlot?.direction ?? null;
      const newDir: "across" | "down" | null =
        state.selected?.row === row && state.selected?.col === col
          ? currentDir === "across" ? "down" : "across"
          : currentDir;

      const slot = findSlot(puzzle.slots as SlotWithClue[], row, col, newDir);
      return {
        ...state,
        selected: { row, col },
        activeSlot: slot,
        checked: false,
        errors: makeEmptyBool(puzzle.grid.length, puzzle.grid[0].length),
        startedAt: state.startedAt ?? Date.now(),
      };
    }

    case "TYPE": {
      if (!state.selected || state.completed) return state;
      const { row, col } = state.selected;
      const letter = action.letter.toUpperCase();

      const letters = state.letters.map((r) => [...r]);
      letters[row][col] = letter;

      // Advance cursor to next empty cell in active slot
      let selected = state.selected;
      if (state.activeSlot) {
        const next = nextEmpty(letters, state.activeSlot);
        if (next) selected = { row: next[0], col: next[1] };
      }

      const completed = isComplete(letters, puzzle);
      return { ...state, letters, selected, completed };
    }

    case "ERASE": {
      if (!state.selected || state.completed) return state;
      const { row, col } = state.selected;
      const letters = state.letters.map((r) => [...r]);
      letters[row][col] = "";
      return { ...state, letters, checked: false, errors: makeEmptyBool(puzzle.grid.length, puzzle.grid[0].length) };
    }

    case "CHECK": {
      const errors = computeErrors(state.letters, puzzle);
      return { ...state, checked: true, errors };
    }

    case "REVEAL_WORD": {
      if (!state.activeSlot) return state;
      const slot = state.activeSlot;
      const dr = slot.direction === "down" ? 1 : 0;
      const dc = slot.direction === "across" ? 1 : 0;
      const letters = state.letters.map((r) => [...r]);
      const revealed = new Set(state.revealed);
      for (let i = 0; i < slot.length; i++) {
        const r = slot.row + dr * i;
        const c = slot.col + dc * i;
        letters[r][c] = slot.answer[i];
        revealed.add(`${r},${c}`);
      }
      const completed = isComplete(letters, puzzle);
      return { ...state, letters, revealed, completed, checked: false, errors: makeEmptyBool(puzzle.grid.length, puzzle.grid[0].length) };
    }

    case "REVEAL_ALL": {
      const letters = puzzle.grid.map((row) => row.map((cell) => cell === "#" ? "#" : cell));
      const revealed = new Set<string>();
      for (let r = 0; r < puzzle.grid.length; r++) {
        for (let c = 0; c < puzzle.grid[0].length; c++) {
          if (puzzle.grid[r][c] !== "#") revealed.add(`${r},${c}`);
        }
      }
      return { ...state, letters, revealed, completed: true, checked: false, errors: makeEmptyBool(puzzle.grid.length, puzzle.grid[0].length) };
    }

    case "TICK":
      if (state.completed || !state.startedAt) return state;
      return { ...state, elapsedSecs: Math.floor((Date.now() - state.startedAt) / 1000) };

    case "RESET":
      return makeInitialState(puzzle);

    default:
      return state;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const CELL = 38; // px per grid cell

export default function CrosswordCard({ puzzle, onNewPuzzle }: CrosswordCardProps) {
  const puzzleRef = useRef(puzzle);
  puzzleRef.current = puzzle;

  const [state, dispatchRaw] = useReducer(
    (s: BoardState, a: Action) => reducer(s, a, puzzleRef.current),
    puzzle,
    makeInitialState
  );
  const dispatch = dispatchRaw;

  const [activeTab, setActiveTab] = useState<"across" | "down">("across");

  useEffect(() => { dispatch({ type: "RESET" }); }, [puzzle, dispatch]);

  useEffect(() => {
    if (state.completed || !state.startedAt) return;
    const id = setInterval(() => dispatch({ type: "TICK" }), 1000);
    return () => clearInterval(id);
  }, [state.completed, state.startedAt, dispatch]);

  // Keyboard input
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!state.selected) return;
      if (e.key.length === 1 && e.key.match(/[a-zA-Z]/)) {
        dispatch({ type: "TYPE", letter: e.key });
      } else if (e.key === "Backspace" || e.key === "Delete") {
        dispatch({ type: "ERASE" });
      } else if (e.key === "Tab") {
        e.preventDefault();
        // Move to next slot
        const slots = puzzle.slots as SlotWithClue[];
        const curIdx = state.activeSlot ? slots.indexOf(state.activeSlot) : -1;
        const next = slots[(curIdx + 1) % slots.length];
        dispatch({ type: "SELECT_CELL", row: next.row, col: next.col });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.selected, state.activeSlot, puzzle.slots, dispatch]);

  // Build number map for cell labels
  const numberMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const slot of puzzle.slots) {
      map.set(`${slot.row},${slot.col}`, slot.number);
    }
    return map;
  }, [puzzle.slots]);

  // Active slot cells for highlight
  const activeSlotCells = useMemo(() => {
    if (!state.activeSlot) return new Set<string>();
    const slot = state.activeSlot;
    const dr = slot.direction === "down" ? 1 : 0;
    const dc = slot.direction === "across" ? 1 : 0;
    const set = new Set<string>();
    for (let i = 0; i < slot.length; i++) {
      set.add(`${slot.row + dr * i},${slot.col + dc * i}`);
    }
    return set;
  }, [state.activeSlot]);

  // Sorted clues for the clue panel
  const acrossClues = useMemo(() =>
    (puzzle.slots as SlotWithClue[])
      .filter((s) => s.direction === "across")
      .sort((a, b) => a.number - b.number),
    [puzzle.slots]
  );
  const downClues = useMemo(() =>
    (puzzle.slots as SlotWithClue[])
      .filter((s) => s.direction === "down")
      .sort((a, b) => a.number - b.number),
    [puzzle.slots]
  );

  const rows = puzzle.grid.length;
  const cols = puzzle.grid[0].length;

  // ── Styles ──────────────────────────────────────────────────────────────────

  const cardStyle: React.CSSProperties = {
    borderTop: "3px double #1a1a1a",
    borderBottom: "2px solid #1a1a1a",
    background: "#faf8f3",
    padding: "1.5rem 1.5rem 1.2rem",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "1rem",
    userSelect: "none",
    WebkitUserSelect: "none",
  };

  // ── Completed ───────────────────────────────────────────────────────────────

  if (state.completed) {
    return (
      <div style={cardStyle}>
        <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700 }}>
            Crossword
          </span>
          <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888" }}>
            {puzzle.category}
          </span>
        </div>
        <div style={{ textAlign: "center", padding: "2rem 1rem", fontFamily: "'Playfair Display', Georgia, serif" }}>
          <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>✓</div>
          <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#0d0d0d" }}>Puzzle complete</div>
          <div style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", color: "#888", marginTop: "0.25rem", fontSize: "0.9rem" }}>
            {state.revealed.size > 0 ? "Completed with reveals" : `Solved in ${formatTime(state.elapsedSecs)}`}
          </div>
        </div>
        {onNewPuzzle && (
          <button onClick={() => onNewPuzzle("medium")} style={{
            padding: "0.4rem 1.2rem", border: "1px solid #1a1a1a",
            background: "#1a1a1a", color: "#faf8f3",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.75rem", letterSpacing: "0.06em",
            textTransform: "uppercase", cursor: "pointer",
          }}>
            New puzzle
          </button>
        )}
      </div>
    );
  }

  // ── Main render ─────────────────────────────────────────────────────────────

  const activeClue = state.activeSlot
    ? `${state.activeSlot.number} ${state.activeSlot.direction.toUpperCase()} — ${state.activeSlot.clue}`
    : "Click a cell to begin";

  return (
    <div style={cardStyle}>
      {/* Header */}
      <div style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontFamily: "'Playfair Display', Georgia, serif", fontSize: "1.3rem", fontWeight: 700 }}>
          Crossword
        </span>
        <span style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.78rem", color: "#888", display: "flex", gap: "1rem" }}>
          <span>{puzzle.category}</span>
          {state.startedAt && <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatTime(state.elapsedSecs)}</span>}
        </span>
      </div>

      {/* Active clue banner */}
      <div style={{
        width: "100%",
        padding: "0.5rem 0.75rem",
        background: "#ede9e1",
        borderLeft: "3px solid #1a1a1a",
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: "0.82rem",
        color: "#0d0d0d",
        minHeight: "2.4rem",
        display: "flex",
        alignItems: "center",
      }}>
        {activeClue}
      </div>

      {/* Grid + clue list side by side */}
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", flexWrap: "wrap", justifyContent: "center", width: "100%" }}>

        {/* Grid */}
        <div style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, ${CELL}px)`,
          gridTemplateRows: `repeat(${rows}, ${CELL}px)`,
          border: "2px solid #1a1a1a",
          flexShrink: 0,
        }}>
          {puzzle.grid.map((row, r) =>
            row.map((cell, c) => {
              const key = `${r},${c}`;
              const isBlack = cell === "#";
              const isSelected = state.selected?.row === r && state.selected?.col === c;
              const isActiveSlot = activeSlotCells.has(key);
              const isRevealed = state.revealed.has(key);
              const isError = state.checked && state.errors[r]?.[c];
              const num = numberMap.get(key);
              const letter = state.letters[r]?.[c] ?? "";

              let bg = "#faf8f3";
              if (isBlack) bg = "#1a1a1a";
              else if (isSelected) bg = "#d4c27a";
              else if (isActiveSlot) bg = "#ede9e1";

              return (
                <div
                  key={key}
                  onClick={() => !isBlack && dispatch({ type: "SELECT_CELL", row: r, col: c })}
                  style={{
                    width: CELL, height: CELL,
                    background: bg,
                    position: "relative",
                    cursor: isBlack ? "default" : "pointer",
                    borderRight: c < cols - 1 ? "0.5px solid #ccc" : "none",
                    borderBottom: r < rows - 1 ? "0.5px solid #ccc" : "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "background 0.08s ease",
                    WebkitTapHighlightColor: "transparent",
                  }}
                >
                  {/* Cell number */}
                  {num !== undefined && (
                    <span style={{
                      position: "absolute",
                      top: 2, left: 2,
                      fontSize: "0.48rem",
                      fontWeight: 700,
                      fontFamily: "Georgia, serif",
                      color: "#1a1a1a",
                      lineHeight: 1,
                      pointerEvents: "none",
                    }}>
                      {num}
                    </span>
                  )}
                  {/* Letter */}
                  {!isBlack && letter && (
                    <span style={{
                      fontFamily: "'Playfair Display', Georgia, serif",
                      fontSize: `${CELL * 0.52}px`,
                      fontWeight: 400,
                      color: isError ? "#c0392b" : isRevealed ? "#1a472a" : "#1a1a1a",
                      lineHeight: 1,
                      pointerEvents: "none",
                    }}>
                      {letter}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Clue list */}
        <div style={{ flex: 1, minWidth: 160, maxWidth: 220 }}>
          {/* Tab bar */}
          <div style={{ display: "flex", borderBottom: "1px solid #1a1a1a", marginBottom: "0.5rem" }}>
            {(["across", "down"] as const).map((dir) => (
              <button
                key={dir}
                onClick={() => setActiveTab(dir)}
                style={{
                  flex: 1, padding: "0.25rem",
                  fontFamily: "'Playfair Display', Georgia, serif",
                  fontSize: "0.68rem", letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  border: "none",
                  borderBottom: activeTab === dir ? "2px solid #1a1a1a" : "2px solid transparent",
                  background: "transparent",
                  color: activeTab === dir ? "#1a1a1a" : "#aaa",
                  cursor: "pointer",
                }}
              >
                {dir}
              </button>
            ))}
          </div>

          {/* Clues */}
          <div style={{ maxHeight: rows * CELL + 20, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
            {(activeTab === "across" ? acrossClues : downClues).map((slot) => {
              const isActive = state.activeSlot?.number === slot.number && state.activeSlot?.direction === slot.direction;
              // Check if word is complete
              const dr = slot.direction === "down" ? 1 : 0;
              const dc = slot.direction === "across" ? 1 : 0;
              const done = Array.from({ length: slot.length }, (_, i) =>
                state.letters[slot.row + dr * i]?.[slot.col + dc * i] === slot.answer[i]
              ).every(Boolean);

              return (
                <div
                  key={`${slot.number}-${slot.direction}`}
                  onClick={() => dispatch({ type: "SELECT_CELL", row: slot.row, col: slot.col })}
                  style={{
                    padding: "0.2rem 0.35rem",
                    background: isActive ? "#ede9e1" : "transparent",
                    cursor: "pointer",
                    borderRadius: 3,
                  }}
                >
                  <span style={{
                    fontFamily: "'Playfair Display', Georgia, serif",
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    color: done ? "#1a472a" : "#555",
                    marginRight: "0.3rem",
                  }}>
                    {slot.number}.
                  </span>
                  <span style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "0.72rem",
                    color: done ? "#888" : "#333",
                    textDecoration: done ? "line-through" : "none",
                  }}>
                    {slot.clue}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center" }}>
        <ActionBtn onClick={() => dispatch({ type: "CHECK" })}>Check</ActionBtn>
        <ActionBtn onClick={() => dispatch({ type: "REVEAL_WORD" })} disabled={!state.activeSlot}>Reveal word</ActionBtn>
        <ActionBtn onClick={() => { if (confirm("Reveal the full puzzle?")) dispatch({ type: "REVEAL_ALL" }); }}>Reveal all</ActionBtn>
        {onNewPuzzle && <ActionBtn onClick={() => onNewPuzzle("medium")}>New puzzle</ActionBtn>}
      </div>

      <p style={{ fontFamily: "'IM Fell English', Georgia, serif", fontStyle: "italic", fontSize: "0.72rem", color: "#bbb", margin: 0 }}>
        Click a cell · type letters · Tab to next word
      </p>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "0.3rem 0.8rem",
        border: "1px solid #ccc",
        background: "transparent",
        color: disabled ? "#ccc" : "#555",
        fontFamily: "'Playfair Display', Georgia, serif",
        fontSize: "0.68rem", letterSpacing: "0.06em",
        textTransform: "uppercase",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  );
}
