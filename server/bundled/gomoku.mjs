// src/lib/shuffle.ts
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/games/gomoku/engine.ts
var SIZE = 15;
var DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1]
];
var FOUL_LABEL = {
  "double-three": "\u4E09\u4E09\u7981\u624B",
  "double-four": "\u56DB\u56DB\u7981\u624B",
  overline: "\u957F\u8FDE\u7981\u624B"
};
function foulLabel(kind) {
  return FOUL_LABEL[kind];
}
function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0));
}
function inBoard(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}
function startGomokuDuel(a, b) {
  return {
    board: emptyBoard(),
    players: [
      { id: a.id, name: a.name, human: a.human !== false, stone: 1 },
      { id: b.id, name: b.name, human: b.human !== false, stone: 2 }
    ],
    turn: 0,
    phase: "play",
    winnerId: null,
    foul: null,
    last: null,
    log: [
      {
        id: uid("l"),
        text: `${a.name} (black) vs ${b.name} (white). Five in a row wins. Black: \u4E09\u4E09 / \u56DB\u56DB / \u957F\u8FDE\u7981\u624B.`
      }
    ]
  };
}
function startGomokuPractice() {
  return startGomokuDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}
function lineLen(board, r, c, dr, dc, stone) {
  let n = 0;
  let rr = r + dr;
  let cc = c + dc;
  while (inBoard(rr, cc) && board[rr][cc] === stone) {
    n += 1;
    rr += dr;
    cc += dc;
  }
  return n;
}
function axisLen(board, r, c, dr, dc, stone) {
  return 1 + lineLen(board, r, c, dr, dc, stone) + lineLen(board, r, c, -dr, -dc, stone);
}
function winsAt(board, r, c) {
  const stone = board[r][c];
  if (!stone) return false;
  return DIRS.some(([dr, dc]) => {
    const n = axisLen(board, r, c, dr, dc, stone);
    return stone === 1 ? n === 5 : n >= 5;
  });
}
function isOverline(board, r, c) {
  const stone = board[r][c];
  if (stone !== 1) return false;
  return DIRS.some(([dr, dc]) => axisLen(board, r, c, dr, dc, stone) >= 6);
}
function fivePointsOnAxis(board, r, c, dr, dc, stone) {
  let ways = 0;
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const rr = r + i * dr;
    const cc = c + i * dc;
    if (!inBoard(rr, cc) || board[rr][cc] !== 0) continue;
    board[rr][cc] = stone;
    const n = axisLen(board, rr, cc, dr, dc, stone);
    const hits = n === 5 && onSameSegment(board, r, c, rr, cc, dr, dc, stone);
    board[rr][cc] = 0;
    if (hits) ways += 1;
  }
  return ways;
}
function onSameSegment(board, r, c, rr, cc, dr, dc, stone) {
  let a = rr;
  let b = cc;
  while (inBoard(a - dr, b - dc) && board[a - dr][b - dc] === stone) {
    a -= dr;
    b -= dc;
  }
  let len = 0;
  let found = false;
  let tr = a;
  let tc = b;
  while (inBoard(tr, tc) && board[tr][tc] === stone) {
    if (tr === r && tc === c) found = true;
    len += 1;
    tr += dr;
    tc += dc;
  }
  return found && len === 5;
}
function isOpenFourOnAxis(board, r, c, dr, dc, stone) {
  return fivePointsOnAxis(board, r, c, dr, dc, stone) >= 2;
}
function isFourOnAxis(board, r, c, dr, dc, stone) {
  return fivePointsOnAxis(board, r, c, dr, dc, stone) >= 1;
}
function isOpenThreeOnAxis(board, r, c, dr, dc, stone) {
  if (isFourOnAxis(board, r, c, dr, dc, stone)) return false;
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const rr = r + i * dr;
    const cc = c + i * dc;
    if (!inBoard(rr, cc) || board[rr][cc] !== 0) continue;
    board[rr][cc] = stone;
    const becameOpenFour = isOpenFourOnAxis(board, r, c, dr, dc, stone);
    board[rr][cc] = 0;
    if (becameOpenFour) return true;
  }
  return false;
}
function countFours(board, r, c, stone) {
  let n = 0;
  for (const [dr, dc] of DIRS) {
    if (isFourOnAxis(board, r, c, dr, dc, stone)) n += 1;
  }
  return n;
}
function countOpenThrees(board, r, c, stone) {
  let n = 0;
  for (const [dr, dc] of DIRS) {
    if (isOpenThreeOnAxis(board, r, c, dr, dc, stone)) n += 1;
  }
  return n;
}
function blackFoulAt(board, r, c) {
  if (board[r][c] !== 1) return null;
  if (isOverline(board, r, c)) return "overline";
  if (winsAt(board, r, c)) return null;
  if (countFours(board, r, c, 1) >= 2) return "double-four";
  if (countOpenThrees(board, r, c, 1) >= 2) return "double-three";
  return null;
}
function applyGomokuAction(state, actorId, action) {
  if (state.phase !== "play" || action.type !== "place") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId) return state;
  const { r, c } = action;
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || state.board[r][c]) return state;
  const board = state.board.map((row) => row.slice());
  board[r][c] = me.stone;
  if (me.stone === 1) {
    const foul = blackFoulAt(board, r, c);
    if (foul) {
      const opp = state.players.find((p) => p.id !== me.id);
      const tip = FOUL_LABEL[foul];
      return {
        ...state,
        board,
        phase: "over",
        winnerId: opp.id,
        foul: { kind: foul, r, c },
        last: { r, c },
        log: [
          ...state.log,
          {
            id: uid("l"),
            text: `${me.name} \u9ED1\u65B9${tip}\uFF08${r + 1},${c + 1}\uFF09\u2014 ${opp.name} wins.`
          }
        ]
      };
    }
  }
  if (winsAt(board, r, c)) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: me.id,
      foul: null,
      last: { r, c },
      log: [...state.log, { id: uid("l"), text: `${me.name} wins with five in a row.` }]
    };
  }
  const full = board.every((row) => row.every((cell) => cell !== 0));
  if (full) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: null,
      foul: null,
      last: { r, c },
      log: [...state.log, { id: uid("l"), text: "Draw \u2014 board full." }]
    };
  }
  return {
    ...state,
    board,
    turn: (state.turn + 1) % 2,
    foul: null,
    last: { r, c },
    log: [...state.log, { id: uid("l"), text: `${me.name} plays (${r + 1},${c + 1}).` }]
  };
}
function viewGomoku(state, _viewerId) {
  return state;
}
function scoreCell(board, r, c, stone) {
  let score = 0;
  for (const [dr, dc] of DIRS) {
    const n = axisLen(board, r, c, dr, dc, stone);
    if (n >= 5) score += 1e4;
    else if (n === 4) score += 800;
    else if (n === 3) score += 120;
    else if (n === 2) score += 20;
  }
  return score;
}
function aiGomoku(state) {
  const me = state.players[state.turn];
  const oppStone = me.stone === 1 ? 2 : 1;
  let best = null;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (state.board[r][c]) continue;
      let near = 0;
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (inBoard(rr, cc) && state.board[rr][cc]) near += 1;
        }
      }
      if (!near && state.last) continue;
      const trial = state.board.map((row) => row.slice());
      trial[r][c] = me.stone;
      if (me.stone === 1 && blackFoulAt(trial, r, c)) continue;
      if (winsAt(trial, r, c)) return { type: "place", r, c };
      trial[r][c] = oppStone;
      const block = winsAt(trial, r, c) ? 5e3 : 0;
      trial[r][c] = me.stone;
      const attack = scoreCell(trial, r, c, me.stone);
      trial[r][c] = oppStone;
      const defend = scoreCell(trial, r, c, oppStone) * 0.9;
      const center = 7 - Math.abs(r - 7) - Math.abs(c - 7);
      const score = block + attack + defend + near * 3 + center;
      if (!best || score > best.score) best = { r, c, score };
    }
  }
  if (best) return { type: "place", r: best.r, c: best.c };
  return { type: "place", r: 7, c: 7 };
}
export {
  SIZE,
  aiGomoku,
  applyGomokuAction,
  blackFoulAt,
  foulLabel,
  startGomokuDuel,
  startGomokuPractice,
  viewGomoku,
  winsAt
};
