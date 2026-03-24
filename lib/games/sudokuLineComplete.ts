/**
 * Detect fully correct rows, columns, and 3×3 boxes for celebration flashes.
 */

export function completedSudokuUnits(
  values: number[][],
  solution: number[][]
): Set<string> {
  const s = new Set<string>();

  for (let r = 0; r < 9; r++) {
    let ok = true;
    for (let c = 0; c < 9; c++) {
      if (values[r][c] === 0 || values[r][c] !== solution[r][c]) ok = false;
    }
    if (ok) s.add(`row:${r}`);
  }

  for (let c = 0; c < 9; c++) {
    let ok = true;
    for (let r = 0; r < 9; r++) {
      if (values[r][c] === 0 || values[r][c] !== solution[r][c]) ok = false;
    }
    if (ok) s.add(`col:${c}`);
  }

  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      let ok = true;
      for (let r = br * 3; r < br * 3 + 3; r++) {
        for (let c = bc * 3; c < bc * 3 + 3; c++) {
          if (values[r][c] === 0 || values[r][c] !== solution[r][c]) ok = false;
        }
      }
      if (ok) s.add(`box:${br},${bc}`);
    }
  }

  return s;
}

export function cellInFlashUnits(r: number, c: number, units: string[]): boolean {
  for (const u of units) {
    if (u.startsWith("row:")) {
      if (r === Number(u.slice(4))) return true;
    } else if (u.startsWith("col:")) {
      if (c === Number(u.slice(4))) return true;
    } else if (u.startsWith("box:")) {
      const [br, bc] = u.slice(4).split(",").map(Number);
      if (Math.floor(r / 3) === br && Math.floor(c / 3) === bc) return true;
    }
  }
  return false;
}
