// src/lib/shuffle.ts
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/games/c4/engine.ts
var SIZE = 4;
var DIRS = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
  [1, 1, 0],
  [1, -1, 0],
  [1, 0, 1],
  [1, 0, -1],
  [0, 1, 1],
  [0, 1, -1],
  [1, 1, 1],
  [1, 1, -1],
  [1, -1, 1],
  [1, -1, -1]
];
function inCube(x, y, z) {
  return x >= 0 && x < SIZE && y >= 0 && y < SIZE && z >= 0 && z < SIZE;
}
function emptyBoard() {
  return Array.from(
    { length: SIZE },
    () => Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0))
  );
}
function seat(p, i) {
  return { id: p.id, name: p.name, human: p.human !== false, stone: i === 0 ? 1 : i === 1 ? 2 : null };
}
function dropZ(board, x, y) {
  if (!inCube(x, y, 0)) return -1;
  for (let z = 0; z < SIZE; z++) {
    if (!board[x][y][z]) return z;
  }
  return -1;
}
function walk(board, x, y, z, dx, dy, dz, stone) {
  const cells = [];
  for (let s = -3; s <= 3; s++) {
    const nx = x + dx * s;
    const ny = y + dy * s;
    const nz = z + dz * s;
    if (!inCube(nx, ny, nz) || board[nx][ny][nz] !== stone) {
      if (cells.length >= 4) return cells;
      cells.length = 0;
      continue;
    }
    cells.push({ x: nx, y: ny, z: nz });
  }
  return cells.length >= 4 ? cells.slice(0, 4) : null;
}
function winLineAt(board, x, y, z) {
  const stone = board[x][y][z];
  if (!stone) return null;
  for (const [dx, dy, dz] of DIRS) {
    const line = walk(board, x, y, z, dx, dy, dz, stone);
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
    log: [{ id: uid("l"), text: `${players[0]?.name} drops first. Four in a line through the cube wins.` }]
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
  return board.map((face) => face.map((col) => col.slice()));
}
function applyDrop(board, x, y, stone) {
  const z = dropZ(board, x, y);
  if (z < 0) return null;
  const next = cloneBoard(board);
  next[x][y][z] = stone;
  return { board: next, z };
}
function scoreCell(x, y, z) {
  const cx = 1.5;
  const d = Math.abs(x - cx) + Math.abs(y - cx) + Math.abs(z - cx);
  return 8 - d;
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
  const placed = applyDrop(state.board, action.x, action.y, me.stone);
  if (!placed) return state;
  const { board, z } = placed;
  const line = winLineAt(board, action.x, action.y, z);
  if (line) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: me.id,
      winLine: line,
      last: { x: action.x, y: action.y, z },
      log: [...state.log, { id: uid("l"), text: `${me.name} connects four and wins.` }]
    };
  }
  const full = board.every((face) => face.every((col) => col.every((cell) => cell !== 0)));
  if (full) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: null,
      winLine: null,
      last: { x: action.x, y: action.y, z },
      log: [...state.log, { id: uid("l"), text: "Draw \u2014 the cube is full." }]
    };
  }
  return {
    ...state,
    board,
    turn: (state.turn + 1) % 2,
    last: { x: action.x, y: action.y, z },
    log: [...state.log, { id: uid("l"), text: `${me.name} drops at (${action.x + 1},${action.y + 1}).` }]
  };
}
function viewC4(state, _viewerId) {
  return state;
}
function aiC4(state) {
  const me = state.players[state.turn];
  const stone = me?.stone ?? 1;
  const foe = stone === 1 ? 2 : 1;
  const options = [];
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      if (dropZ(state.board, x, y) >= 0) options.push({ x, y });
    }
  }
  const pick = options[0] ?? { x: 0, y: 0 };
  const tryWin = (who) => {
    for (const opt of options) {
      const placed = applyDrop(state.board, opt.x, opt.y, who);
      if (placed && winLineAt(placed.board, opt.x, opt.y, placed.z)) return opt;
    }
    return null;
  };
  const win = tryWin(stone);
  if (win) return { type: "drop", ...win };
  const block = tryWin(foe);
  if (block) return { type: "drop", ...block };
  let best = pick;
  let bestScore = -999;
  for (const opt of options) {
    const z = dropZ(state.board, opt.x, opt.y);
    const s = scoreCell(opt.x, opt.y, Math.max(0, z)) + Math.random() * 0.3;
    if (s > bestScore) {
      bestScore = s;
      best = opt;
    }
  }
  return { type: "drop", ...best };
}
export {
  SIZE,
  aiC4,
  applyC4Action,
  dropZ,
  startC4Duel,
  startC4Lobby,
  startC4Practice,
  viewC4,
  winLineAt
};
