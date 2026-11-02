// src/lib/shuffle.ts
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/games/ttt/engine.ts
var SIZE = 3;
function seat(p, i) {
  return { id: p.id, name: p.name, human: p.human !== false, mark: i === 0 ? 1 : i === 1 ? 2 : null };
}
function emptyBoard() {
  return Array.from({ length: SIZE * SIZE }, () => 0);
}
var LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6]
];
function lineAt(board) {
  for (const line of LINES) {
    const a = board[line[0]];
    if (a && a === board[line[1]] && a === board[line[2]]) return line;
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
    log: [{ id: uid("l"), text: `${players[0]?.name} places X. Three in a row wins.` }]
  };
}
function startTttLobby(people) {
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
function startTttDuel(a, b) {
  return beginMatch([a, b]);
}
function startTttPractice() {
  return startTttDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}
function winnerOf(board) {
  const line = lineAt(board);
  return line ? board[line[0]] : 0;
}
function minimax(board, mark, depth) {
  const win = winnerOf(board);
  if (win === 1) return { score: 10 - depth, i: -1 };
  if (win === 2) return { score: depth - 10, i: -1 };
  const empties = board.map((v, i) => v ? -1 : i).filter((i) => i >= 0);
  if (!empties.length) return { score: 0, i: -1 };
  let best = { score: mark === 1 ? -99 : 99, i: empties[0] };
  for (const i of empties) {
    const next = board.slice();
    next[i] = mark;
    const child = minimax(next, mark === 1 ? 2 : 1, depth + 1);
    if (mark === 1 ? child.score > best.score : child.score < best.score) {
      best = { score: child.score, i };
    }
  }
  return best;
}
function applyTttAction(state, actorId, action) {
  if (state.phase === "over") return state;
  if (state.phase === "lobby") {
    if (action.type === "start" && state.players[0]?.id === actorId && state.players.length >= 2) {
      return beginMatch(state.players);
    }
    return state;
  }
  if (state.phase !== "play" || action.type !== "place") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId || !me.mark) return state;
  const i = action.i;
  if (i < 0 || i >= SIZE * SIZE || state.board[i]) return state;
  const board = state.board.slice();
  board[i] = me.mark;
  const line = lineAt(board);
  if (line) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: me.id,
      winLine: line,
      last: i,
      log: [...state.log, { id: uid("l"), text: `${me.name} wins with three in a row.` }]
    };
  }
  if (board.every((c) => c !== 0)) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: null,
      winLine: null,
      last: i,
      log: [...state.log, { id: uid("l"), text: "Draw \u2014 the board is full." }]
    };
  }
  return {
    ...state,
    board,
    turn: (state.turn + 1) % 2,
    last: i,
    log: [...state.log, { id: uid("l"), text: `${me.name} places ${me.mark === 1 ? "X" : "O"}.` }]
  };
}
function viewTtt(state, _viewerId) {
  return state;
}
function aiTtt(state) {
  const me = state.players[state.turn];
  const mark = me?.mark ?? 1;
  const move = minimax(state.board, mark, 0);
  const i = move.i >= 0 ? move.i : state.board.findIndex((c) => c === 0);
  return { type: "place", i: Math.max(0, i) };
}
export {
  SIZE,
  aiTtt,
  applyTttAction,
  lineAt,
  startTttDuel,
  startTttLobby,
  startTttPractice,
  viewTtt
};
