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
function newPuzzle(max = 10) {
  for (let i = 0; i < 400; i++) {
    const nums = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * max));
    const solution = solve24(nums);
    if (solution) return { nums, solution };
  }
  return { nums: [1, 3, 4, 6], solution: "(6/(1-(3/4)))" };
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
    throw new Error(`\u65E0\u6CD5\u8BC6\u522B\u7684\u7B26\u53F7\uFF1A${ch}`);
  }
  return out;
}
function parseExpr(tokens) {
  let i = 0;
  const peek = () => tokens[i];
  const eat = (t) => {
    const v = tokens[i];
    if (t && v !== t) throw new Error("\u8868\u8FBE\u5F0F\u4E0D\u5408\u6CD5");
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
    throw new Error("\u8868\u8FBE\u5F0F\u4E0D\u5408\u6CD5");
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
  if (i !== tokens.length) throw new Error("\u8868\u8FBE\u5F0F\u4E0D\u5B8C\u6574");
  return { value, used };
}
function checkSolution(nums, expr) {
  try {
    const { value, used } = parseExpr(tokenize(expr));
    const a = [...used].sort((x, y) => x - y);
    const b = [...nums].sort((x, y) => x - y);
    if (a.length !== b.length || a.some((n, i) => n !== b[i])) {
      return { ok: false, error: "\u5FC5\u987B\u7528\u5B8C\u8FD9\u56DB\u5F20\u724C\uFF0C\u4E14\u6BCF\u5F20\u53EA\u7528\u4E00\u6B21\u3002" };
    }
    if (!Number.isFinite(value) || Math.abs(value - 24) > 1e-6) {
      return { ok: false, value, error: `\u7ED3\u679C\u662F ${Number(value.toFixed(4))}\uFF0C\u4E0D\u662F 24\u3002` };
    }
    return { ok: true, value: 24 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "\u65E0\u6CD5\u8BA1\u7B97" };
  }
}
function shuffleDeck() {
  const deck = shuffle(Array.from({ length: 40 }, (_, i) => i % 10 + 1));
  return deck;
}
function startM24Practice() {
  const state = startM24Duel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU" });
  return { ...state, message: "\u7EC3\u4E60\u4EBA\u673A\u3002CPU \u7EA6 8 \u79D2\u540E\u4F1A\u4EA4\u5377\uFF0C\u62A2\u5148\u51D1\u51FA 24\u3002" };
}
function startM24Duel(a, b) {
  const puzzle = newPuzzle();
  return {
    mode: "duel",
    players: [a, b],
    nums: puzzle.nums,
    solution: puzzle.solution,
    scores: { [a.id]: 0, [b.id]: 0 },
    phase: "play",
    round: 1,
    goal: 3,
    winnerId: null,
    message: "\u540C\u4E00\u7EC4\u724C\uFF0C\u8C01\u5148\u51D1\u51FA 24 \u5F97\u5206\u3002\u5148\u5230 3 \u5206\u3002"
  };
}
function applyM24Action(state, actorId, action) {
  if (state.phase !== "play") return state;
  if (!state.players.some((p) => p.id === actorId)) return state;
  if (action.type !== "submit") return state;
  const res = checkSolution(state.nums, action.expr);
  const actor = state.players.find((p) => p.id === actorId);
  if (!res.ok) {
    return { ...state, message: `${actor?.name || "\u73A9\u5BB6"}\uFF1A${res.error}` };
  }
  const scores = { ...state.scores, [actorId]: (state.scores[actorId] || 0) + 1 };
  if (scores[actorId] >= state.goal) {
    return {
      ...state,
      scores,
      phase: "over",
      winnerId: actorId,
      message: `${actor?.name} \u51D1\u51FA 24\uFF0C\u5148\u5230 ${state.goal} \u5206\u83B7\u80DC\u3002`
    };
  }
  const puzzle = newPuzzle();
  return {
    ...state,
    scores,
    nums: puzzle.nums,
    solution: puzzle.solution,
    round: state.round + 1,
    message: `${actor?.name} \u5F97\u5206\uFF01${scores[actorId]} / ${state.goal}\u3002\u4E0B\u4E00\u9898\u3002`
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
