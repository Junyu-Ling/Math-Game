// src/lib/shuffle.ts
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/games/gomoku/engine.ts
var SIZE = 15;
function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0));
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
    last: null,
    log: [{ id: uid("l"), text: `${a.name} (black) vs ${b.name} (white). Five in a row wins.` }]
  };
}
function startGomokuPractice() {
  return startGomokuDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}
function lineLen(board, r, c, dr, dc, stone) {
  let n = 0;
  let rr = r + dr;
  let cc = c + dc;
  while (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && board[rr][cc] === stone) {
    n += 1;
    rr += dr;
    cc += dc;
  }
  return n;
}
function winsAt(board, r, c) {
  const stone = board[r][c];
  if (!stone) return false;
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];
  return dirs.some(
    ([dr, dc]) => 1 + lineLen(board, r, c, dr, dc, stone) + lineLen(board, r, c, -dr, -dc, stone) >= 5
  );
}
function applyGomokuAction(state, actorId, action) {
  if (state.phase !== "play" || action.type !== "place") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId) return state;
  const { r, c } = action;
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE || state.board[r][c]) return state;
  const board = state.board.map((row) => row.slice());
  board[r][c] = me.stone;
  if (winsAt(board, r, c)) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: me.id,
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
      last: { r, c },
      log: [...state.log, { id: uid("l"), text: "Draw \u2014 board full." }]
    };
  }
  return {
    ...state,
    board,
    turn: (state.turn + 1) % 2,
    last: { r, c },
    log: [...state.log, { id: uid("l"), text: `${me.name} plays (${r + 1},${c + 1}).` }]
  };
}
function viewGomoku(state, _viewerId) {
  return state;
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
          if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE && state.board[rr][cc]) near += 1;
        }
      }
      if (!near && state.last) continue;
      const trial = state.board.map((row) => row.slice());
      trial[r][c] = me.stone;
      if (winsAt(trial, r, c)) return { type: "place", r, c };
      trial[r][c] = oppStone;
      const block = winsAt(trial, r, c) ? 500 : 0;
      const center = 7 - Math.abs(r - 7) - Math.abs(c - 7);
      const score = block + near * 3 + center;
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
  startGomokuDuel,
  startGomokuPractice,
  viewGomoku,
  winsAt
};
