import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "gentle_stream_grid_selection_color";

/** Default soft green — clearly distinct from peer highlight (#ede9e1) and wrong (#fce8e6). */
export const DEFAULT_GRID_SELECTION_COLOR = "#b5d5b8";

function isValidHex(s: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(s);
}

/**
 * Persisted selected-cell background for Sudoku / Killer Sudoku grids (localStorage).
 */
export function useGridSelectionColor(): [string, (hex: string) => void] {
  const [color, setColor] = useState(DEFAULT_GRID_SELECTION_COLOR);

  useEffect(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v && isValidHex(v)) setColor(v);
    } catch {
      /* ignore */
    }
  }, []);

  const setPersisted = useCallback((hex: string) => {
    if (!isValidHex(hex)) return;
    setColor(hex);
    try {
      localStorage.setItem(STORAGE_KEY, hex);
    } catch {
      /* ignore */
    }
  }, []);

  return [color, setPersisted];
}
