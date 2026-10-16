// src/lib/shuffle.ts
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/games/gomoku/ai.ts
var DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1]
];
var SCORE = {
  five: 5e5,
  liveFour: 5e4,
  rushFour: 1e4,
  liveThree: 5e3,
  sleepThree: 500,
  liveTwo: 200,
  sleepTwo: 40,
  liveOne: 10
};
var WIN = 1e7;
var SEARCH_DEPTH = 3;
var CANDIDATE_LIMIT = 14;
var NEAR = 2;
function inBoard(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}
function cloneBoard(board) {
  return board.map((row) => row.slice());
}
function isLegal(board, r, c, stone) {
  if (!inBoard(r, c) || board[r][c]) return false;
  if (stone !== 1) return true;
  board[r][c] = 1;
  const foul = blackFoulAt(board, r, c);
  board[r][c] = 0;
  return !foul;
}
function ray(board, r, c, dr, dc, stone) {
  let n = 0;
  let rr = r + dr;
  let cc = c + dc;
  while (inBoard(rr, cc) && board[rr][cc] === stone) {
    n += 1;
    rr += dr;
    cc += dc;
  }
  const open = inBoard(rr, cc) && board[rr][cc] === 0;
  return { n, open };
}
function scoreAxis(board, r, c, dr, dc, stone) {
  const a = ray(board, r, c, dr, dc, stone);
  const b = ray(board, r, c, -dr, -dc, stone);
  const len = a.n + b.n + 1;
  const opens = (a.open ? 1 : 0) + (b.open ? 1 : 0);
  let score = 0;
  if (len >= 5) score = SCORE.five;
  else if (len === 4) score = opens === 2 ? SCORE.liveFour : opens === 1 ? SCORE.rushFour : 0;
  else if (len === 3) score = opens === 2 ? SCORE.liveThree : opens === 1 ? SCORE.sleepThree : 0;
  else if (len === 2) score = opens === 2 ? SCORE.liveTwo : opens === 1 ? SCORE.sleepTwo : 0;
  else if (len === 1) score = opens === 2 ? SCORE.liveOne : 0;
  score += scoreGap(board, r, c, dr, dc, stone);
  return score;
}
function scoreGap(board, r, c, dr, dc, stone) {
  let best = 0;
  for (const sign of [1, -1]) {
    const sdr = dr * sign;
    const sdc = dc * sign;
    const eR = r + sdr;
    const eC = c + sdc;
    if (!inBoard(eR, eC) || board[eR][eC] !== 0) continue;
    let run = 0;
    let rr = eR + sdr;
    let cc = eC + sdc;
    while (inBoard(rr, cc) && board[rr][cc] === stone) {
      run += 1;
      rr += sdr;
      cc += sdc;
    }
    if (run === 0) continue;
    const farOpen = inBoard(rr, cc) && board[rr][cc] === 0;
    const back = ray(board, r, c, -sdr, -sdc, stone);
    const total = back.n + 1 + run;
    if (total >= 4 && (back.open || farOpen)) best = Math.max(best, SCORE.rushFour * 0.85);
    else if (total === 3 && back.open && farOpen) best = Math.max(best, SCORE.liveThree * 0.8);
    else if (total === 3 && (back.open || farOpen)) best = Math.max(best, SCORE.sleepThree * 0.8);
  }
  return best;
}
function scorePoint(board, r, c, stone) {
  let s = 0;
  for (const [dr, dc] of DIRS) s += scoreAxis(board, r, c, dr, dc, stone);
  return s;
}
function hasNeighbor(board, r, c, dist) {
  for (let dr = -dist; dr <= dist; dr++) {
    for (let dc = -dist; dc <= dist; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (inBoard(rr, cc) && board[rr][cc]) return true;
    }
  }
  return false;
}
function candidates(board, me, opp, limit) {
  const empty = !board.some((row) => row.some((x) => x !== 0));
  if (empty) return [{ r: 7, c: 7, h: 1 }];
  const list = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] || !hasNeighbor(board, r, c, NEAR)) continue;
      if (!isLegal(board, r, c, me)) continue;
      board[r][c] = me;
      if (winsAt(board, r, c)) {
        board[r][c] = 0;
        return [{ r, c, h: WIN }];
      }
      const attack = scorePoint(board, r, c, me);
      board[r][c] = 0;
      let oppWin = false;
      let defend = 0;
      if (isLegal(board, r, c, opp)) {
        board[r][c] = opp;
        oppWin = winsAt(board, r, c);
        defend = scorePoint(board, r, c, opp);
        board[r][c] = 0;
      }
      const center = 8 - Math.abs(r - 7) - Math.abs(c - 7);
      const h = (oppWin ? WIN * 0.9 : 0) + attack + defend * 1.05 + center;
      list.push({ r, c, h });
    }
  }
  list.sort((a, b) => b.h - a.h);
  return list.slice(0, limit);
}
function evaluateBoard(board, me, opp) {
  let mine = 0;
  let theirs = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] || !hasNeighbor(board, r, c, NEAR)) continue;
      board[r][c] = me;
      mine += scorePoint(board, r, c, me);
      board[r][c] = opp;
      theirs += scorePoint(board, r, c, opp);
      board[r][c] = 0;
    }
  }
  return mine - theirs * 1.1;
}
function alphabeta(board, depth, alpha, beta, me, opp, maximizing) {
  if (depth === 0) return evaluateBoard(board, me, opp);
  const stone = maximizing ? me : opp;
  const other = maximizing ? opp : me;
  const moves = candidates(board, stone, other, CANDIDATE_LIMIT);
  if (!moves.length) return evaluateBoard(board, me, opp);
  if (maximizing) {
    let best2 = -Infinity;
    for (const m of moves) {
      board[m.r][m.c] = stone;
      let val;
      if (winsAt(board, m.r, m.c)) val = WIN + depth;
      else val = alphabeta(board, depth - 1, alpha, beta, me, opp, false);
      board[m.r][m.c] = 0;
      if (val > best2) best2 = val;
      if (best2 > alpha) alpha = best2;
      if (alpha >= beta) break;
    }
    return best2;
  }
  let best = Infinity;
  for (const m of moves) {
    if (stone === 1 && !isLegal(board, m.r, m.c, 1)) continue;
    board[m.r][m.c] = stone;
    let val;
    if (winsAt(board, m.r, m.c)) val = -WIN - depth;
    else val = alphabeta(board, depth - 1, alpha, beta, me, opp, true);
    board[m.r][m.c] = 0;
    if (val < best) best = val;
    if (best < beta) beta = best;
    if (alpha >= beta) break;
  }
  return best === Infinity ? evaluateBoard(board, me, opp) : best;
}
function computeGomokuMove(state) {
  const me = state.players[state.turn];
  const myStone = me.stone ?? 1;
  const oppStone = myStone === 1 ? 2 : 1;
  const board = cloneBoard(state.board);
  const root = candidates(board, myStone, oppStone, CANDIDATE_LIMIT);
  if (!root.length) return { type: "place", r: 7, c: 7 };
  if (root[0].h >= WIN * 0.85) return { type: "place", r: root[0].r, c: root[0].c };
  let bestMove = root[0];
  let bestScore = -Infinity;
  for (const m of root) {
    board[m.r][m.c] = myStone;
    let score;
    if (winsAt(board, m.r, m.c)) score = WIN;
    else score = alphabeta(board, SEARCH_DEPTH - 1, -Infinity, Infinity, myStone, oppStone, false);
    board[m.r][m.c] = 0;
    score += Math.random() * 3;
    if (score > bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }
  return { type: "place", r: bestMove.r, c: bestMove.c };
}

// src/games/gomoku/engine.ts
var SIZE = 15;
var RPS_REVEAL_MS = 2800;
var DIRS2 = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1]
];
var FOUL_LABEL = {
  "double-three": "double three",
  "double-four": "double four",
  overline: "overline"
};
var RPS_LABEL = { rock: "rock", paper: "paper", scissors: "scissors" };
function foulLabel(kind) {
  return FOUL_LABEL[kind];
}
function emptyBoard() {
  return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () => 0));
}
function inBoard2(r, c) {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}
function seat(p) {
  return { id: p.id, name: p.name, human: p.human !== false, stone: null };
}
function startGomokuLobby(people) {
  const players = people.slice(0, 2).map(seat);
  return {
    board: emptyBoard(),
    players,
    turn: 0,
    phase: "lobby",
    rpsThrows: {},
    rpsReveal: null,
    winnerId: null,
    foul: null,
    winLine: null,
    last: null,
    log: [
      {
        id: uid("l"),
        text: `Table ${players.length}/2. Open table, add a CPU or invite, then start. RPS winner plays black.`
      }
    ]
  };
}
function startGomokuDuel(a, b) {
  return beginGomokuMatch([a, b]);
}
function startGomokuPractice() {
  return startGomokuDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}
function beginGomokuMatch(people) {
  const players = people.slice(0, 2).map(seat);
  return {
    board: emptyBoard(),
    players,
    turn: 0,
    phase: "rps",
    rpsThrows: {},
    rpsReveal: null,
    winnerId: null,
    foul: null,
    winLine: null,
    last: null,
    log: [
      {
        id: uid("l"),
        text: `Rock-paper-scissors. Winner plays black. Five in a row wins. Black fouls (RIF): double three, double four, overline.`
      }
    ]
  };
}
function rpsWins(a, b) {
  return a === "rock" && b === "scissors" || a === "paper" && b === "rock" || a === "scissors" && b === "paper";
}
function beginRpsReveal(state, aId, a, bId, b) {
  return {
    ...state,
    rpsThrows: { [aId]: a, [bId]: b },
    rpsReveal: { aId, a, bId, b }
  };
}
function assignBlack(state, blackId, note) {
  const players = state.players.map((p) => ({
    ...p,
    stone: p.id === blackId ? 1 : 2
  }));
  const turn = players.findIndex((p) => p.id === blackId);
  const black = players.find((p) => p.id === blackId);
  const white = players.find((p) => p.id !== blackId);
  return {
    ...state,
    players,
    turn: turn < 0 ? 0 : turn,
    phase: "play",
    rpsThrows: {},
    rpsReveal: null,
    log: [
      ...state.log,
      { id: uid("l"), text: note },
      {
        id: uid("l"),
        text: `${black?.name || "Black"} plays black \xB7 ${white?.name || "White"} plays white. Black to move.`
      }
    ]
  };
}
function finishGomokuRps(state) {
  state = normalizeGomoku(state);
  if (state.phase !== "rps" || !state.rpsReveal) return state;
  const { aId, a, bId, b } = state.rpsReveal;
  if (a === b) {
    return {
      ...state,
      rpsThrows: {},
      rpsReveal: null,
      log: [...state.log, { id: uid("l"), text: `Tie, both ${RPS_LABEL[a]}. Throw again.` }]
    };
  }
  const winnerId = rpsWins(a, b) ? aId : bId;
  const winner = state.players.find((p) => p.id === winnerId);
  const aName = state.players.find((p) => p.id === aId)?.name;
  const bName = state.players.find((p) => p.id === bId)?.name;
  return assignBlack(
    state,
    winnerId,
    `${aName} ${RPS_LABEL[a]} vs ${bName} ${RPS_LABEL[b]}. ${winner?.name || "Winner"} takes black.`
  );
}
function normalizeGomoku(state) {
  if (!state) return state;
  const players = (state.players || []).map((p) => ({
    ...p,
    stone: p.stone === 1 || p.stone === 2 ? p.stone : null
  }));
  const hasColors = players.every((p) => p.stone === 1 || p.stone === 2);
  let phase = state.phase;
  if (phase !== "lobby" && phase !== "rps" && phase !== "play" && phase !== "over") {
    phase = hasColors ? "play" : "rps";
  } else if (phase === "play" && !hasColors) {
    phase = "rps";
  }
  return {
    ...state,
    players,
    phase,
    rpsThrows: state.rpsThrows || {},
    rpsReveal: state.rpsReveal ?? null,
    foul: state.foul ?? null,
    winLine: state.winLine ?? null,
    last: state.last ?? null,
    winnerId: state.winnerId ?? null,
    board: state.board || emptyBoard(),
    log: state.log || [],
    turn: Number.isFinite(state.turn) ? state.turn : 0
  };
}
function playRps(state, actorId, you) {
  state = normalizeGomoku(state);
  if (state.phase !== "rps" || state.rpsReveal) return state;
  const me = state.players.find((p) => p.id === actorId);
  const foe = state.players.find((p) => p.id !== actorId);
  if (!me || !foe) return state;
  const throws = state.rpsThrows || {};
  if (throws[me.id]) return state;
  if (!foe.human) {
    const ai = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];
    return beginRpsReveal(state, me.id, you, foe.id, ai);
  }
  const theirs = throws[foe.id];
  if (!theirs) {
    return {
      ...state,
      rpsThrows: { ...throws, [me.id]: you },
      log: [...state.log, { id: uid("l"), text: `${me.name} is ready. Waiting for the other hand.` }]
    };
  }
  return beginRpsReveal({ ...state, rpsThrows: { ...throws, [me.id]: you } }, me.id, you, foe.id, theirs);
}
function lineLen(board, r, c, dr, dc, stone) {
  let n = 0;
  let rr = r + dr;
  let cc = c + dc;
  while (inBoard2(rr, cc) && board[rr][cc] === stone) {
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
  return Boolean(winLineAt(board, r, c));
}
function winLineAt(board, r, c) {
  const stone = board[r][c];
  if (!stone) return null;
  for (const [dr, dc] of DIRS2) {
    const n = axisLen(board, r, c, dr, dc, stone);
    const win = stone === 1 ? n === 5 : n >= 5;
    if (!win) continue;
    let sr = r;
    let sc = c;
    while (inBoard2(sr - dr, sc - dc) && board[sr - dr][sc - dc] === stone) {
      sr -= dr;
      sc -= dc;
    }
    const run = [];
    let rr = sr;
    let cc = sc;
    while (inBoard2(rr, cc) && board[rr][cc] === stone) {
      run.push({ r: rr, c: cc });
      rr += dr;
      cc += dc;
    }
    if (run.length < 5) continue;
    const hit = run.findIndex((p) => p.r === r && p.c === c);
    const start = Math.max(0, Math.min(hit - 2, run.length - 5));
    return run.slice(start, start + 5);
  }
  return null;
}
function isOverline(board, r, c) {
  const stone = board[r][c];
  if (stone !== 1) return false;
  return DIRS2.some(([dr, dc]) => axisLen(board, r, c, dr, dc, stone) >= 6);
}
function fivePointsOnAxis(board, r, c, dr, dc, stone) {
  let ways = 0;
  for (let i = -4; i <= 4; i++) {
    if (i === 0) continue;
    const rr = r + i * dr;
    const cc = c + i * dc;
    if (!inBoard2(rr, cc) || board[rr][cc] !== 0) continue;
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
  while (inBoard2(a - dr, b - dc) && board[a - dr][b - dc] === stone) {
    a -= dr;
    b -= dc;
  }
  let len = 0;
  let found = false;
  let tr = a;
  let tc = b;
  while (inBoard2(tr, tc) && board[tr][tc] === stone) {
    if (tr === r && tc === c) found = true;
    len += 1;
    tr += dr;
    tc += dc;
  }
  return found && len === 5;
}
function isStraightFourOnAxis(board, r, c, dr, dc, stone) {
  return axisLen(board, r, c, dr, dc, stone) === 4 && fivePointsOnAxis(board, r, c, dr, dc, stone) >= 2;
}
function isFourOnAxis(board, r, c, dr, dc, stone) {
  return fivePointsOnAxis(board, r, c, dr, dc, stone) >= 1;
}
function countFours(board, r, c, stone) {
  let n = 0;
  for (const [dr, dc] of DIRS2) {
    if (isFourOnAxis(board, r, c, dr, dc, stone)) n += 1;
  }
  return n;
}
function isThreeOnAxis(board, r, c, dr, dc, stone, depth) {
  if (isFourOnAxis(board, r, c, dr, dc, stone)) return false;
  for (let i = -5; i <= 5; i++) {
    if (i === 0) continue;
    const rr = r + i * dr;
    const cc = c + i * dc;
    if (!inBoard2(rr, cc) || board[rr][cc] !== 0) continue;
    board[rr][cc] = stone;
    const madeFiveOrMore = axisLen(board, rr, cc, dr, dc, stone) >= 5;
    const becameStraight = !madeFiveOrMore && (isStraightFourOnAxis(board, r, c, dr, dc, stone) || isStraightFourOnAxis(board, rr, cc, dr, dc, stone));
    let illegalMake = false;
    if (becameStraight && stone === 1) {
      if (isOverline(board, rr, cc) || countFours(board, rr, cc, 1) >= 2) illegalMake = true;
      else if (depth < 4 && countThrees(board, rr, cc, 1, depth + 1) >= 2) illegalMake = true;
    }
    board[rr][cc] = 0;
    if (becameStraight && !illegalMake) return true;
  }
  return false;
}
function countThrees(board, r, c, stone, depth = 0) {
  let n = 0;
  for (const [dr, dc] of DIRS2) {
    if (isThreeOnAxis(board, r, c, dr, dc, stone, depth)) n += 1;
  }
  return n;
}
function blackFoulAt(board, r, c) {
  if (board[r][c] !== 1) return null;
  if (isOverline(board, r, c)) return "overline";
  if (winsAt(board, r, c)) return null;
  if (countFours(board, r, c, 1) >= 2) return "double-four";
  if (countThrees(board, r, c, 1) >= 2) return "double-three";
  return null;
}
function applyGomokuAction(state, actorId, action) {
  state = normalizeGomoku(state);
  if (state.phase === "over") return state;
  if (state.phase === "lobby") {
    if (action.type === "start" && state.players[0]?.id === actorId && state.players.length >= 2) {
      return beginGomokuMatch(state.players);
    }
    return state;
  }
  if (state.phase === "rps") {
    if (action.type === "rps") return playRps(state, actorId, action.throw);
    return state;
  }
  if (state.phase !== "play" || action.type !== "place") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId || !me.stone) return state;
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
        winLine: null,
        last: { r, c },
        log: [
          ...state.log,
          {
            id: uid("l"),
            text: `${me.name} fouls with ${tip} at (${r + 1},${c + 1}) \u2014 ${opp.name} wins.`
          }
        ]
      };
    }
  }
  const line = winLineAt(board, r, c);
  if (line) {
    return {
      ...state,
      board,
      phase: "over",
      winnerId: me.id,
      foul: null,
      winLine: line,
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
      winLine: null,
      last: { r, c },
      log: [...state.log, { id: uid("l"), text: "Draw \u2014 board full." }]
    };
  }
  return {
    ...state,
    board,
    turn: (state.turn + 1) % 2,
    foul: null,
    winLine: null,
    last: { r, c },
    log: [...state.log, { id: uid("l"), text: `${me.name} plays (${r + 1},${c + 1}).` }]
  };
}
function viewGomoku(state, viewerId) {
  const s = normalizeGomoku(state);
  const throws = s.rpsThrows || {};
  const id = String(viewerId || "");
  return {
    ...s,
    rpsThrows: s.rpsReveal ? { [s.rpsReveal.aId]: s.rpsReveal.a, [s.rpsReveal.bId]: s.rpsReveal.b } : throws[id] ? { [id]: throws[id] } : {},
    rpsReveal: s.rpsReveal
  };
}
function aiGomoku(state) {
  if (state.phase === "rps") {
    const hand = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];
    return { type: "rps", throw: hand };
  }
  return computeGomokuMove(state);
}
export {
  RPS_REVEAL_MS,
  SIZE,
  aiGomoku,
  applyGomokuAction,
  blackFoulAt,
  finishGomokuRps,
  foulLabel,
  normalizeGomoku,
  startGomokuDuel,
  startGomokuLobby,
  startGomokuPractice,
  viewGomoku,
  winLineAt,
  winsAt
};
