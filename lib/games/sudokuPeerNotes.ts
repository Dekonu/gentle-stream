/**
 * Clear pencil-mark bit for `digit` (1–9) from peer cells when a correct digit is placed.
 * Clears row, column, 3×3 box, and (when applicable) main diagonals through (r, c).
 *
 * NoteMask: bitmask, bit (n-1) set ⇔ pencil mark for digit n.
 */

export function clearDigitNotesFromPeers(
  notes: number[][],
  r: number,
  c: number,
  digit: number
): void {
  if (digit < 1 || digit > 9) return;
  const bit = 1 << (digit - 1);

  for (let i = 0; i < 9; i++) {
    notes[r][i] &= ~bit;
    notes[i][c] &= ~bit;
  }

  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let rr = br; rr < br + 3; rr++) {
    for (let cc = bc; cc < bc + 3; cc++) {
      notes[rr][cc] &= ~bit;
    }
  }

  if (r === c) {
    for (let i = 0; i < 9; i++) notes[i][i] &= ~bit;
  }
  if (r + c === 8) {
    for (let i = 0; i < 9; i++) notes[i][8 - i] &= ~bit;
  }
}
