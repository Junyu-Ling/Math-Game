/** Quick RIF foul checks — run: node scripts/test-renju-fouls.mjs */
import { blackFoulAt } from "../src/games/gomoku/engine.ts";

function empty() {
  return Array.from({ length: 15 }, () => Array(15).fill(0));
}

function place(b, cells, stone = 1) {
  for (const [r, c] of cells) b[r][c] = stone;
}

function assert(name, cond) {
  if (!cond) throw new Error(`FAIL ${name}`);
  console.log(`ok ${name}`);
}

// Classic double live three: cross `_●●●_` × `_●●●_`
{
  const b = empty();
  place(b, [
    [7, 5],
    [7, 6],
    [5, 7],
    [6, 7],
  ]);
  b[7][7] = 1;
  assert("classic 三三", blackFoulAt(b, 7, 7) === "double-three");
}

// Sleeping three + live three should NOT be 三三 (horizontal blocked into 冲四 only)
{
  const b = empty();
  // Vertical open three around (7,7): (5,7)(6,7) + play (7,7) with room below
  place(b, [
    [5, 7],
    [6, 7],
    [7, 5],
    [7, 6],
  ]);
  // White blocks one side of the horizontal so it cannot become straight four both ways
  b[7][4] = 2;
  b[7][7] = 1;
  // Horizontal _blocked●●●●? wait we have ●● at 5,6 and play 7 → three with white at 4
  // Open side at 8,9... becoming four at 8: ●●●● with white at 4 — only one five-point (right) = 冲四, not 活四
  const foul = blackFoulAt(b, 7, 7);
  assert("眠三+活三 not 三三", foul !== "double-three");
}

// Double rush four (冲四×冲四) is 四四
{
  const b = empty();
  place(b, [
    [7, 4],
    [7, 5],
    [7, 6],
    [4, 7],
    [5, 7],
    [6, 7],
  ]);
  b[7][3] = 2;
  b[3][7] = 2;
  b[7][7] = 1;
  assert("冲四双四", blackFoulAt(b, 7, 7) === "double-four");
}

// Overline
{
  const b = empty();
  place(b, [
    [7, 3],
    [7, 4],
    [7, 5],
    [7, 6],
    [7, 8],
  ]);
  b[7][7] = 1;
  assert("长连", blackFoulAt(b, 7, 7) === "overline");
}

// Exact five is win path — blackFoulAt returns null when winsAt
{
  const b = empty();
  place(b, [
    [7, 3],
    [7, 4],
    [7, 5],
    [7, 6],
  ]);
  b[7][7] = 1;
  assert("正五非禁", blackFoulAt(b, 7, 7) === null);
}

console.log("all renju foul checks passed");
