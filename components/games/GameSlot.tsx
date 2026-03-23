"use client";

import { useCallback, useEffect, useState } from "react";
import SudokuCard from "./SudokuCard";
import type { SudokuPuzzle, Difficulty, GameType } from "@/lib/games/types";

interface GameSlotProps {
  gameType: GameType;
  difficulty?: Difficulty;
  /** Inside a hero article: lighter chrome, no full-bleed section borders */
  embedded?: boolean;
}

export default function GameSlot({
  gameType,
  difficulty = "medium",
  embedded = false,
}: GameSlotProps) {
  const [puzzle, setPuzzle] = useState<SudokuPuzzle | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDifficulty, setCurrentDifficulty] = useState<Difficulty>(difficulty);

  const fetchPuzzle = useCallback(async (diff: Difficulty) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/game/sudoku?difficulty=${diff}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SudokuPuzzle = await res.json();
      setPuzzle(data);
      setCurrentDifficulty(diff);
    } catch (e) {
      setError("Could not load puzzle — try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPuzzle(currentDifficulty);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleNewPuzzle = useCallback((diff: Difficulty) => {
    fetchPuzzle(diff);
  }, [fetchPuzzle]);

  const shellStyle = embedded
    ? {
        borderTop: "1px solid #d4cfc4",
        borderBottom: "none",
        background: "transparent",
      }
    : {
        borderTop: "3px double #1a1a1a",
        borderBottom: "2px solid #1a1a1a",
        background: "#faf8f3",
      };

  if (loading) {
    return (
      <div
        style={{
          ...shellStyle,
          textAlign: "center",
          fontFamily: "'IM Fell English', Georgia, serif",
          fontStyle: "italic",
          color: "#bbb",
          fontSize: "0.88rem",
          padding: embedded ? "1.5rem 0" : "3rem",
        }}
      >
        Setting the puzzle&hellip;
      </div>
    );
  }

  if (error || !puzzle) {
    return (
      <div
        style={{
          ...shellStyle,
          padding: embedded ? "1rem 0" : "2rem",
          textAlign: "center",
        }}
      >
        <p style={{
          fontFamily: "'IM Fell English', Georgia, serif",
          fontStyle: "italic",
          color: "#8b4513",
          marginBottom: "1rem",
          fontSize: "0.9rem",
        }}>
          {error ?? "Puzzle unavailable."}
        </p>
        <button
          onClick={() => fetchPuzzle(currentDifficulty)}
          style={{
            background: "#1a1a1a",
            color: "#faf8f3",
            border: "none",
            padding: "0.4rem 1.2rem",
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: "0.75rem",
            letterSpacing: "0.06em",
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (gameType === "sudoku") {
    return (
      <SudokuCard
        puzzle={puzzle}
        onNewPuzzle={handleNewPuzzle}
        embedded={embedded}
      />
    );
  }

  // Future game types slot in here
  return null;
}
