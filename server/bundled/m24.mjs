// src/lib/shuffle.ts
function shuffle(items) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = next[i];
    const b = next[j];
    if (a === void 0 || b === void 0) continue;
    next[i] = b;
    next[j] = a;
  }
  return next;
}
function uid(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

// src/lib/poker.ts
var RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
var SUITS = ["S", "H", "D", "C"];
function rankValue(rank) {
  if (rank === "A") return 1;
  if (rank === "J") return 11;
  if (rank === "Q") return 12;
  if (rank === "K") return 13;
  if (rank === "BJ") return 14;
  if (rank === "RJ") return 15;
  return Number(rank);
}
function makeDeck() {
  const cards = [];
  for (const suit of SUITS) for (const rank of RANKS) cards.push({ id: uid("pk"), suit, rank });
  return shuffle(cards);
}

// src/games/math24/engine.ts
var OPS = [
  { s: "+", f: (a, b) => a + b },
  { s: "-", f: (a, b) => a - b },
  { s: "*", f: (a, b) => a * b },
  { s: "/", f: (a, b) => b !== 0 ? a / b : Number.NaN }
];
function nearly(a, b) {
  return Math.abs(a - b) < 1e-6;
}
function solve24(nums) {
  const search = (arr) => {
    if (arr.length === 1) {
      const only = arr[0];
      return only && nearly(only.n, 24) ? only.e : null;
    }
    for (let i = 0; i < arr.length; i++) {
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue;
        const a = arr[i];
        const b = arr[j];
        if (!a || !b) continue;
        const rest = arr.filter((_, k) => k !== i && k !== j);
        for (const op of OPS) {
          if (op.s === "/" && Math.abs(b.n) < 1e-9) continue;
          if ((op.s === "+" || op.s === "*") && i > j) continue;
          const n = op.f(a.n, b.n);
          if (!Number.isFinite(n)) continue;
          const e = `(${a.e}${op.s}${b.e})`;
          const hit = search([...rest, { n, e }]);
          if (hit) return hit;
        }
      }
    }
    return null;
  };
  return search(nums.map((n) => ({ n, e: String(n) })));
}
function newPuzzle(_max = 13) {
  for (let i = 0; i < 500; i++) {
    const cards2 = makeDeck().slice(0, 4);
    const nums = cards2.map((c) => rankValue(c.rank));
    const solution = solve24(nums);
    if (solution) return { nums, cards: cards2, solution };
  }
  const cards = makeDeck().slice(0, 4);
  return { nums: [1, 3, 4, 6], cards, solution: "(6/(1-(3/4)))" };
}
function randomUnsolved(max = 10) {
  return Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * max));
}
function tokenize(src) {
  const out = [];
  let i = 0;
  const s = src.replace(/×/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  while (i < s.length) {
    const ch = s[i];
    if (!ch) break;
    if ("+-*/()".includes(ch)) {
      out.push(ch);
      i += 1;
      continue;
    }
    if (/\d/.test(ch)) {
      let n = ch;
      i += 1;
      while (i < s.length && /\d/.test(s[i] ?? "")) {
        n += s[i];
        i += 1;
      }
      out.push(n);
      continue;
    }
    throw new Error(`Unknown symbol: ${ch}`);
  }
  return out;
}
function parseExpr(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const eat = (t) => {
    const v = tokens[i];
    if (t && v !== t) throw new Error("Invalid expression");
    i += 1;
    return v;
  };
  const used = [];
  const parsePrimary = () => {
    const t = peek();
    if (t === "(") {
      eat("(");
      const v = parseAdd();
      eat(")");
      return v;
    }
    if (t && /^\d+$/.test(t)) {
      eat();
      used.push(Number(t));
      return Number(t);
    }
    throw new Error("Invalid expression");
  };
  const parseMul = () => {
    let v = parsePrimary();
    while (peek() === "*" || peek() === "/") {
      const op = eat();
      const r = parsePrimary();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };
  const parseAdd = () => {
    let v = parseMul();
    while (peek() === "+" || peek() === "-") {
      const op = eat();
      const r = parseMul();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  };
  const value = parseAdd();
  if (i !== tokens.length) throw new Error("Incomplete expression");
  return { value, used };
}
function checkSolution(nums, expr) {
  try {
    const { value, used } = parseExpr(tokenize(expr));
    const a = [...used].sort((x, y) => x - y);
    const b = [...nums].sort((x, y) => x - y);
    if (a.length !== b.length || a.some((n, i) => n !== b[i])) {
      return { ok: false, error: "Use all four cards, each once." };
    }
    if (!Number.isFinite(value) || Math.abs(value - 24) > 1e-6) {
      return { ok: false, value, error: `Got ${Number(value.toFixed(4))}, not 24.` };
    }
    return { ok: true, value: 24 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Cannot evaluate" };
  }
}
function shuffleDeck() {
  const deck = shuffle(Array.from({ length: 40 }, (_, i) => i % 10 + 1));
  return deck;
}
function startM24Practice() {
  const state = startM24Duel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU" });
  return { ...state, message: "Practice vs CPU. The CPU submits in about 8 seconds. Make 24 first." };
}
function startM24Duel(a, b) {
  const puzzle = newPuzzle();
  return {
    mode: "duel",
    players: [a, b],
    nums: puzzle.nums,
    cards: puzzle.cards,
    solution: puzzle.solution,
    scores: { [a.id]: 0, [b.id]: 0 },
    phase: "play",
    round: 1,
    goal: 3,
    winnerId: null,
    message: "Same cards. First to make 24 scores. First to 3 points."
  };
}
function applyM24Action(state, actorId, action) {
  if (state.phase !== "play") return state;
  if (!state.players.some((p) => p.id === actorId)) return state;
  if (action.type !== "submit") return state;
  const res = checkSolution(state.nums, action.expr);
  const actor = state.players.find((p) => p.id === actorId);
  if (!res.ok) {
    return { ...state, message: `${actor?.name || "Player"}: ${res.error}` };
  }
  const scores = { ...state.scores, [actorId]: (state.scores[actorId] || 0) + 1 };
  if (scores[actorId] >= state.goal) {
    return {
      ...state,
      scores,
      phase: "over",
      winnerId: actorId,
      message: `${actor?.name} made 24. First to ${state.goal} wins.`
    };
  }
  const puzzle = newPuzzle();
  return {
    ...state,
    scores,
    nums: puzzle.nums,
    cards: puzzle.cards,
    solution: puzzle.solution,
    round: state.round + 1,
    message: `${actor?.name} scores! ${scores[actorId]} / ${state.goal}. Next hand.`
  };
}
function viewM24(state, _viewerId) {
  return { ...state, solution: state.phase === "over" ? state.solution : "" };
}
export {
  applyM24Action,
  checkSolution,
  newPuzzle,
  randomUnsolved,
  shuffleDeck,
  solve24,
  startM24Duel,
  startM24Practice,
  tokenize,
  viewM24
};
