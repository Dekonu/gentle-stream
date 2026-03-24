import { fillCrosswordGrid } from "../lib/games/crosswordGridFiller";

let passed = 0;
let failed = 0;

function assert(cond: boolean, label: string, detail?: string) {
  if (cond) { console.log(`  ✓  ${label}`); passed++; }
  else { console.error(`  ✗  ${label}`); if (detail) console.error(`     ${detail}`); failed++; }
}

console.log("══════════════════════════════════════════════");
console.log("  Crossword Grid Filler Tests");
console.log("══════════════════════════════════════════════");

for (const category of ["Science & Discovery", "Arts & Culture", undefined]) {
  console.log(`\n── ${category ?? "no category"} ─────────────────────────────`);
  const result = fillCrosswordGrid(category);
  assert(result !== null, "Grid filled successfully");
  if (!result) continue;

  const { grid, slots } = result;

  // Grid dimensions
  assert(grid.length === 5, `Grid has 7 rows (got ${grid.length})`);
  assert(grid.every(r => r.length === 5), "All rows have 7 cols");

  // All cells are letters or #
  const allValid = grid.every(row => row.every(cell => /^[A-Z#]$/.test(cell)));
  assert(allValid, "All cells are A-Z or #");

  // All slots have answers
  const allAnswered = slots.every(s => s.answer.length === s.length);
  assert(allAnswered, "All slots have answers");

  // Answers are in the grid
  let answersMatch = true;
  for (const slot of slots) {
    const dr = slot.direction === "down" ? 1 : 0;
    const dc = slot.direction === "across" ? 1 : 0;
    for (let i = 0; i < slot.length; i++) {
      const r = slot.row + dr * i;
      const c = slot.col + dc * i;
      if (grid[r][c] !== slot.answer[i]) { answersMatch = false; break; }
    }
    if (!answersMatch) break;
  }
  assert(answersMatch, "All slot answers match grid letters");

  // At least 4 slots
  assert(slots.length >= 4, `Has at least 4 slots (got ${slots.length})`);

  // All slots have clue numbers
  assert(slots.every(s => s.number > 0), "All slots numbered");

  console.log(`     ${slots.length} slots: ${slots.filter(s=>s.direction==="across").length} across, ${slots.filter(s=>s.direction==="down").length} down`);
}

console.log("\n── Performance ─────────────────────────────────────────");
const times: number[] = [];
for (let i = 0; i < 5; i++) {
  const t = Date.now();
  fillCrosswordGrid("Innovation & Tech");
  times.push(Date.now() - t);
}
const avg = Math.round(times.reduce((a,b)=>a+b,0)/times.length);
const max = Math.max(...times);
assert(avg < 500, `Average fill time ${avg}ms < 500ms`);
assert(max < 2000, `Worst-case fill time ${max}ms < 2000ms`);

console.log(`\n══════════════════════════════════════════════`);
console.log(`  ${passed} passed  |  ${failed} failed`);
console.log(`══════════════════════════════════════════════\n`);
process.exit(failed > 0 ? 1 : 0);
