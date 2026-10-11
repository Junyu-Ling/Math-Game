// src/lib/shuffle.ts
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/games/animal/engine.ts
var COLS = 7;
var ROWS = 9;
var RANK = {
  elephant: 8,
  lion: 7,
  tiger: 6,
  leopard: 5,
  wolf: 4,
  dog: 3,
  cat: 2,
  rat: 1
};
var LABEL = {
  elephant: "\u8C61",
  lion: "\u72EE",
  tiger: "\u864E",
  leopard: "\u8C79",
  wolf: "\u72FC",
  dog: "\u72D7",
  cat: "\u732B",
  rat: "\u9F20"
};
function river(r, c) {
  return r >= 3 && r <= 5 && (c === 1 || c === 2 || c === 4 || c === 5);
}
function den(r, c, side) {
  return side === 0 ? r === 0 && c === 3 : r === 8 && c === 3;
}
function trap(r, c, side) {
  if (side === 0) return r === 0 && (c === 2 || c === 4) || r === 1 && c === 3;
  return r === 8 && (c === 2 || c === 4) || r === 7 && c === 3;
}
function setup() {
  const b = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => null));
  const place = (r, c, side, kind) => {
    b[r][c] = { id: uid("a"), side, kind };
  };
  place(0, 0, 0, "lion");
  place(0, 6, 0, "tiger");
  place(1, 1, 0, "dog");
  place(1, 5, 0, "cat");
  place(2, 0, 0, "rat");
  place(2, 2, 0, "leopard");
  place(2, 4, 0, "wolf");
  place(2, 6, 0, "elephant");
  place(8, 6, 1, "lion");
  place(8, 0, 1, "tiger");
  place(7, 5, 1, "dog");
  place(7, 1, 1, "cat");
  place(6, 6, 1, "rat");
  place(6, 4, 1, "leopard");
  place(6, 2, 1, "wolf");
  place(6, 0, 1, "elephant");
  return b;
}
function startAnimalDuel(a, b) {
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
    log: [{ id: uid("l"), text: `${a.name} (top) vs ${b.name} (bottom). Enter the rival den to win.` }]
  };
}
function startAnimalPractice() {
  return startAnimalDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}
function canCapture(atk, def, atkTrapped) {
  if (atkTrapped) return false;
  if (atk === "rat" && def === "elephant") return true;
  if (atk === "elephant" && def === "rat") return false;
  return RANK[atk] >= RANK[def];
}
function jumpLand(board, r, c, dr, dc) {
  let rr = r + dr;
  let cc = c + dc;
  let sawRiver = false;
  while (rr >= 0 && rr < ROWS && cc >= 0 && cc < COLS && river(rr, cc)) {
    sawRiver = true;
    if (board[rr][cc]?.kind === "rat") return null;
    rr += dr;
    cc += dc;
  }
  if (!sawRiver) return null;
  if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS) return null;
  return { r: rr, c: cc };
}
function movesFrom(state, r, c) {
  const piece = state.board[r][c];
  if (!piece) return [];
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
    if (den(rr, cc, piece.side)) continue;
    if (river(rr, cc) && piece.kind !== "rat") {
      if (piece.kind === "lion" || piece.kind === "tiger") {
        const land = jumpLand(state.board, r, c, dr, dc);
        if (land) {
          const tgt2 = state.board[land.r][land.c];
          if (!tgt2 || tgt2.side !== piece.side && canCapture(piece.kind, tgt2.kind, trap(land.r, land.c, piece.side))) {
            out.push(land);
          }
        }
      }
      continue;
    }
    if (river(rr, cc) && piece.kind === "rat") {
    } else if (river(rr, cc)) continue;
    const tgt = state.board[rr][cc];
    if (!tgt) {
      out.push({ r: rr, c: cc });
      continue;
    }
    if (tgt.side === piece.side) continue;
    const atkTrapped = trap(r, c, piece.side === 0 ? 1 : 0);
    const defInTrap = trap(rr, cc, tgt.side === 0 ? 1 : 0);
    if (defInTrap || canCapture(piece.kind, tgt.kind, atkTrapped)) out.push({ r: rr, c: cc });
  }
  return out;
}
function applyAnimalAction(state, actorId, action) {
  if (state.phase !== "play") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId) return state;
  if (action.type === "clear") return { ...state, selected: null };
  if (action.type === "select") {
    const p = state.board[action.r]?.[action.c];
    if (!p || p.side !== me.side) return { ...state, selected: null };
    return { ...state, selected: { r: action.r, c: action.c } };
  }
  if (action.type === "move" && state.selected) {
    const from = state.selected;
    const legal = movesFrom(state, from.r, from.c);
    if (!legal.some((m) => m.r === action.r && m.c === action.c)) return state;
    const piece = state.board[from.r][from.c];
    const board = state.board.map((row) => row.slice());
    board[from.r][from.c] = null;
    board[action.r][action.c] = piece;
    let winnerId = null;
    let phase = "play";
    let log = [...state.log, { id: uid("l"), text: `${me.name} moves ${LABEL[piece.kind]}.` }];
    if (den(action.r, action.c, me.side === 0 ? 1 : 0)) {
      winnerId = me.id;
      phase = "over";
      log = [...log, { id: uid("l"), text: `${me.name} enters the den and wins!` }];
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
function viewAnimal(state, _viewerId) {
  return state;
}
function aiAnimal(state) {
  const me = state.players[state.turn];
  const cands = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = state.board[r][c];
      if (!p || p.side !== me.side) continue;
      for (const m of movesFrom(state, r, c)) {
        let score = Math.random();
        const tgt = state.board[m.r][m.c];
        if (tgt) score += 10 + RANK[tgt.kind];
        if (den(m.r, m.c, me.side === 0 ? 1 : 0)) score += 100;
        const goalR = me.side === 0 ? 8 : 0;
        score += (ROWS - Math.abs(m.r - goalR)) * 0.2;
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
function cellKind(r, c) {
  if (den(r, c, 0) || den(r, c, 1)) return "den";
  if (trap(r, c, 0) || trap(r, c, 1)) return "trap";
  if (river(r, c)) return "river";
  return "plain";
}
export {
  COLS,
  LABEL,
  ROWS,
  aiAnimal,
  applyAnimalAction,
  cellKind,
  movesFrom,
  startAnimalDuel,
  startAnimalPractice,
  viewAnimal
};
