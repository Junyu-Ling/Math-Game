/** Black foul checks — run: node scripts/test-renju-fouls.mjs */
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
  assert("classic 双活三", blackFoulAt(b, 7, 7) === "double-three");
}

// Jump live threes: `●●_●` × `●●_●`, each gap fills into `_●●●●_`
{
  const b = empty();
  place(b, [
    [7, 4],
    [7, 5],
    [4, 7],
    [5, 7],
  ]);
  b[7][7] = 1;
  assert("跳活三 双活三", blackFoulAt(b, 7, 7) === "double-three");
}

// Sleeping three + live three is not 双活三 (horizontal can only become 冲四)
{
  const b = empty();
  place(b, [
    [5, 7],
    [6, 7],
    [7, 5],
    [7, 6],
  ]);
  b[7][4] = 2;
  b[7][7] = 1;
  assert("眠三+活三 not 三三", blackFoulAt(b, 7, 7) === null);
}

// Two rush fours (one end blocked by white) are not a foul
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
  assert("冲四×冲四 not 四四", blackFoulAt(b, 7, 7) === null);
}

// Two true live fours: `_●●●●_` × `_●●●●_`
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
  b[7][7] = 1;
  assert("双活四", blackFoulAt(b, 7, 7) === "double-four");
}

// Live four + rush four is not double live four
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
  b[3][7] = 2;
  b[7][7] = 1;
  assert("活四+冲四 not 四四", blackFoulAt(b, 7, 7) === null);
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

// Exact five is a win, not a foul
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

// Exact five beats an overline on another axis
{
  const b = empty();
  place(b, [
    [7, 3],
    [7, 4],
    [7, 5],
    [7, 6],
    [2, 7],
    [3, 7],
    [4, 7],
    [5, 7],
    [6, 7],
  ]);
  b[7][7] = 1;
  assert("正五胜长连", blackFoulAt(b, 7, 7) === null);
}

// A live four elsewhere on the axis must not be credited to this stone
{
  const b = empty();
  place(b, [
    [5, 7],
    [6, 7],
    [7, 10],
    [7, 11],
    [7, 12],
  ]);
  b[7][7] = 1;
  assert("远处活四不算本子活三", blackFoulAt(b, 7, 7) === null);
}

console.log("all renju foul checks passed");
