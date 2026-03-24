import type { CrosswordSlot } from "./crosswordGridFiller";

/**
 * Stable JSON key per grid entry. Word-square puzzles often repeat the same
 * answer string for an across and a down slot; clue maps keyed only by answer
 * then show duplicate text for both tabs.
 */
export function slotClueMapKey(slot: CrosswordSlot): string {
  return `${slot.number}-${slot.direction}`;
}

/** Normalize model keys like "1-ACROSS" / "1 – down" to "1-across". */
export function canonicalizeClueKeys(
  raw: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v !== "string") continue;
    const trimmed = k.trim();
    const m = trimmed.match(/^(\d+)\s*[-–]\s*(\w+)$/i);
    if (m) {
      out[`${m[1]}-${m[2].toLowerCase()}`] = v;
    } else {
      out[trimmed] = v;
    }
  }
  return out;
}

export function buildCluePromptBlock(slots: CrosswordSlot[]): string {
  return slots
    .map(
      (s) =>
        `${slotClueMapKey(s)}: ${s.answer} (${s.direction}, ${s.length} letters)`
    )
    .join("\n");
}

export function clueForSlot(
  slot: CrosswordSlot,
  clueMap: Record<string, string>,
  mechanical: (s: CrosswordSlot) => string
): string {
  const bySlot = clueMap[slotClueMapKey(slot)];
  if (typeof bySlot === "string" && bySlot.trim()) return bySlot.trim();
  const byAnswer = clueMap[slot.answer];
  if (typeof byAnswer === "string" && byAnswer.trim()) return byAnswer.trim();
  return mechanical(slot);
}
