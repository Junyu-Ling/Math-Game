// src/lib/shuffle.ts
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/games/army/engine.ts
var POWER = {
  flag: 0,
  mine: 0,
  bomb: 99,
  commander: 10,
  general: 9,
  major: 8,
  colonel: 7,
  captain: 6,
  lieutenant: 5,
  engineer: 3
};
var RANK_LABEL = {
  flag: "\u519B\u65D7",
  commander: "\u53F8\u4EE4",
  general: "\u519B\u957F",
  major: "\u5E08\u957F",
  colonel: "\u65C5\u957F",
  captain: "\u56E2\u957F",
  lieutenant: "\u8425\u957F",
  engineer: "\u5DE5\u5175",
  bomb: "\u70B8\u5F39",
  mine: "\u5730\u96F7"
};
var ROWS = 6;
var COLS = 5;
function layout(side) {
  return side === 0 ? ["commander", "general", "major", "colonel", "captain", "lieutenant", "engineer", "bomb", "mine", "flag"] : ["flag", "mine", "bomb", "engineer", "lieutenant", "captain", "colonel", "major", "general", "commander"];
}
function setup() {
  const b = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
  const put = (ranks, startR, side) => {
    let i = 0;
    for (let r = startR; r < startR + 2; r++) {
      for (let c = 0; c < COLS; c++) {
        const rank = ranks[i++];
        b[r][c] = { id: uid("m"), side, rank };
      }
    }
  };
  put(layout(0), 0, 0);
  put(layout(1), 4, 1);
  return b;
}
function startArmyDuel(a, b) {
  return {
    board: setup(),
    players: [
      { id: a.id, name: a.name, human: a.human !== false, side: 0 },
      { id: b.id, name: b.name, human: b.human !== false, side: 1 }
    ],
    turn: 0,
    phase: "play",
    winnerId: null,
    selected: null,
    log: [{ id: uid("l"), text: `${a.name} vs ${b.name}. Capture the rival \u519B\u65D7 to win.` }]
  };
}
function startArmyPractice() {
  return startArmyDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}
function immobile(rank) {
  return rank === "flag" || rank === "mine";
}
function resolve(atk, def) {
  if (def === "flag") return "atk";
  if (atk === "bomb" || def === "bomb") return "both";
  if (def === "mine") return atk === "engineer" ? "atk" : "def";
  if (atk === "mine") return "def";
  if (POWER[atk] > POWER[def]) return "atk";
  if (POWER[atk] < POWER[def]) return "def";
  return "both";
}
function armyMoves(state, r, c) {
  const piece = state.board[r][c];
  if (!piece || immobile(piece.rank)) return [];
  const me = state.players[state.turn];
  if (piece.side !== me.side) return [];
  const out = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (const [dr, dc] of dirs) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) continue;
    const tgt = state.board[rr][cc];
    if (!tgt) out.push({ r: rr, c: cc });
    else if (tgt.side !== piece.side) out.push({ r: rr, c: cc });
  }
  return out;
}
function applyArmyAction(state, actorId, action) {
  if (state.phase !== "play") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId) return state;
  if (action.type === "clear") return { ...state, selected: null };
  if (action.type === "select") {
    const p = state.board[action.r]?.[action.c];
    if (!p || p.side !== me.side || immobile(p.rank)) return { ...state, selected: null };
    return { ...state, selected: { r: action.r, c: action.c } };
  }
  if (action.type === "move" && state.selected) {
    const from = state.selected;
    const legal = armyMoves(state, from.r, from.c);
    if (!legal.some((m) => m.r === action.r && m.c === action.c)) return state;
    const atk = state.board[from.r][from.c];
    const def = state.board[action.r][action.c];
    const board = state.board.map((row) => row.slice());
    board[from.r][from.c] = null;
    let log = [...state.log];
    let winnerId = null;
    let phase = "play";
    if (!def) {
      board[action.r][action.c] = atk;
      log = [...log, { id: uid("l"), text: `${me.name} moves ${RANK_LABEL[atk.rank]}.` }];
    } else {
      const res = resolve(atk.rank, def.rank);
      if (def.rank === "flag" && res === "atk") {
        board[action.r][action.c] = atk;
        winnerId = me.id;
        phase = "over";
        log = [...log, { id: uid("l"), text: `${me.name} captures \u519B\u65D7 and wins!` }];
      } else if (res === "atk") {
        board[action.r][action.c] = atk;
        log = [...log, { id: uid("l"), text: `${me.name}'s ${RANK_LABEL[atk.rank]} beats ${RANK_LABEL[def.rank]}.` }];
      } else if (res === "def") {
        board[action.r][action.c] = def;
        log = [...log, { id: uid("l"), text: `${me.name}'s ${RANK_LABEL[atk.rank]} falls to ${RANK_LABEL[def.rank]}.` }];
      } else {
        board[action.r][action.c] = null;
        log = [...log, { id: uid("l"), text: `${RANK_LABEL[atk.rank]} and ${RANK_LABEL[def.rank]} both fall.` }];
      }
    }
    if (phase !== "over") {
      for (const side of [0, 1]) {
        const mine = board.flat().filter((p) => Boolean(p && p.side === side));
        const movable = mine.some((p) => !immobile(p.rank));
        const hasFlag = mine.some((p) => p.rank === "flag");
        if (!hasFlag || !movable) {
          const winner = state.players.find((p) => p.side !== side);
          winnerId = winner.id;
          phase = "over";
          log = [...log, { id: uid("l"), text: `${winner.name} wins \u2014 rival has no fight left.` }];
          break;
        }
      }
    }
    return {
      ...state,
      board,
      selected: null,
      turn: phase === "over" ? state.turn : (state.turn + 1) % 2,
      phase,
      winnerId,
      log
    };
  }
  return state;
}
function viewArmy(state, _viewerId) {
  return state;
}
function aiArmy(state) {
  const me = state.players[state.turn];
  const cands = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = state.board[r][c];
      if (!p || p.side !== me.side) continue;
      for (const m of armyMoves(state, r, c)) {
        let score = Math.random();
        const tgt = state.board[m.r][m.c];
        if (tgt?.rank === "flag") score += 200;
        else if (tgt) score += POWER[tgt.rank] || 1;
        score += me.side === 0 ? m.r : ROWS - 1 - m.r;
        cands.push({ fr: r, fc: c, tr: m.r, tc: m.c, score });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score);
  const best = cands[0];
  if (!best) return { type: "clear" };
  if (!state.selected || state.selected.r !== best.fr || state.selected.c !== best.fc) {
    return { type: "select", r: best.fr, c: best.fc };
  }
  return { type: "move", r: best.tr, c: best.tc };
}
export {
  RANK_LABEL,
  aiArmy,
  applyArmyAction,
  armyMoves,
  startArmyDuel,
  startArmyPractice,
  viewArmy
};
