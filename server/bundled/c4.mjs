// src/lib/shuffle.ts
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/games/c4/engine.ts
var COLS = 7;
var ROWS = 6;
var DIRS = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1]
];
function inBoard(col, row) {
  return col >= 0 && col < COLS && row >= 0 && row < ROWS;
}
function emptyBoard() {
  return Array.from({ length: COLS }, () => Array.from({ length: ROWS }, () => 0));
}
function seat(p, i) {
  return { id: p.id, name: p.name, human: p.human !== false, stone: i === 0 ? 1 : i === 1 ? 2 : null };
}
function dropRow(board, col) {
  if (col < 0 || col >= COLS) return -1;
  for (let row = 0; row < ROWS; row++) {
    if (!board[col][row]) return row;
  }
  return -1;
}
function walk(board, col, row, dc, dr, stone) {
  const cells = [];
  for (let s = -3; s <= 3; s++) {
    const nc = col + dc * s;
    const nr = row + dr * s;
    if (!inBoard(nc, nr) || board[nc][nr] !== stone) {
      if (cells.length >= 4) return cells;
      cells.length = 0;
      continue;
    }
    cells.push({ col: nc, row: nr });
  }
  return cells.length >= 4 ? cells.slice(0, 4) : null;
}
function winLineAt(board, col, row) {
  const stone = board[col][row];
  if (!stone) return null;
  for (const [dc, dr] of DIRS) {
    const line = walk(board, col, row, dc, dr, stone);
    if (line) return line;
  }
  return null;
}
function beginMatch(people) {
  const players = people.slice(0, 2).map(seat);
  return {
    board: emptyBoard(),
    players,
    turn: 0,
    phase: "play",
    winnerId: null,
    winLine: null,
    last: null,
    log: [{ id: uid("l"), text: `${players[0]?.name} drops first. Four in a row wins.` }]
  };
}
function startC4Lobby(people) {
  const players = people.slice(0, 2).map(seat);
  return {
    board: emptyBoard(),
    players,
    turn: 0,
    phase: "lobby",
    winnerId: null,
    winLine: null,
    last: null,
    log: [
      {
        id: uid("l"),
        text: `Table ${players.length}/2. Open a table, add a CPU or invite, then start.`
      }
    ]
  };
}
function startC4Duel(a, b) {
  return beginMatch([a, b]);
}
function startC4Practice() {
  return startC4Duel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}
function cloneBoard(board) {
  return board.map((col) => col.slice());
}
function applyDrop(board, col, stone) {
  const row = dropRow(board, col);
  if (row < 0) return null;
  const next = cloneBoard(board);
  next[col][row] = stone;
  return { board: next, row };
}
function actionCol(action) {
  if (action.type !== "drop") return -1;
  const raw = action;
  const col = Number.isFinite(raw.col) ? Number(raw.col) : Number(raw.x);
  return Number.isFinite(col) ? col : -1;
}
function applyC4Action(state, actorId, action) {
  if (state.phase === "over") return state;
  if (state.phase === "lobby") {
    if (action.type === "start" && state.players[0]?.id === actorId && state.players.length >= 2) {
      return beginMatch(state.players);
    }
    return state;
  }
  if (state.phase !== "play" || action.type !== "drop") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId || !me.stone) return state;
  const col = actionCol(action);
  const placed = applyDrop(state.board, col, me.stone);
  if (!placed) return state;
  const { board, row } = placed;
  const line = winLineAt(board, col, row);
  if (line) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: me.id,
      winLine: line,
      last: { col, row },
      log: [...state.log, { id: uid("l"), text: `${me.name} connects four and wins.` }]
    };
  }
  const full = board.every((shaft) => shaft.every((cell) => cell !== 0));
  if (full) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: null,
      winLine: null,
      last: { col, row },
      log: [...state.log, { id: uid("l"), text: "Draw \u2014 the grid is full." }]
    };
  }
  return {
    ...state,
    board,
    turn: (state.turn + 1) % 2,
    last: { col, row },
    log: [...state.log, { id: uid("l"), text: `${me.name} drops in column ${col + 1}.` }]
  };
}
function viewC4(state, _viewerId) {
  return state;
}
var COL_ORDER = [3, 2, 4, 1, 5, 0, 6];
function aiC4(state) {
  const me = state.players[state.turn];
  const stone = me?.stone ?? 1;
  const foe = stone === 1 ? 2 : 1;
  const options = COL_ORDER.filter((col) => dropRow(state.board, col) >= 0);
  const pick = options[0] ?? 3;
  const tryWin = (who) => {
    for (const col of options) {
      const placed = applyDrop(state.board, col, who);
      if (placed && winLineAt(placed.board, col, placed.row)) return col;
    }
    return null;
  };
  const win = tryWin(stone);
  if (win != null) return { type: "drop", col: win };
  const block = tryWin(foe);
  if (block != null) return { type: "drop", col: block };
  for (const col of options) {
    const placed = applyDrop(state.board, col, stone);
    if (!placed) continue;
    const reply = dropRow(placed.board, col);
    if (reply < 0) return { type: "drop", col };
    placed.board[col][reply] = foe;
    if (!winLineAt(placed.board, col, reply)) return { type: "drop", col };
  }
  return { type: "drop", col: pick };
}
export {
  COLS,
  ROWS,
  aiC4,
  applyC4Action,
  dropRow,
  startC4Duel,
  startC4Lobby,
  startC4Practice,
  viewC4,
  winLineAt
};
