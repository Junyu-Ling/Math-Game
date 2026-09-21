import { shuffle } from "../../lib/shuffle";

export type Puzzle = { nums: number[]; solution: string };

const OPS = [
  { s: "+", f: (a: number, b: number) => a + b },
  { s: "-", f: (a: number, b: number) => a - b },
  { s: "*", f: (a: number, b: number) => a * b },
  { s: "/", f: (a: number, b: number) => (b !== 0 ? a / b : Number.NaN) },
];

function nearly(a: number, b: number) {
  return Math.abs(a - b) < 1e-6;
}

export function solve24(nums: number[]): string | null {
  type Node = { n: number; e: string };
  const search = (arr: Node[]): string | null => {
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

export function newPuzzle(max = 10): Puzzle {
  for (let i = 0; i < 400; i++) {
    const nums = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * max));
    const solution = solve24(nums);
    if (solution) return { nums, solution };
  }
  return { nums: [1, 3, 4, 6], solution: "(6/(1-(3/4)))" };
}

export function randomUnsolved(max = 10): number[] {
  return Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * max));
}

export function tokenize(src: string): string[] {
  const out: string[] = [];
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

function parseExpr(tokens: string[]): { value: number; used: number[] } {
  let i = 0;
  const peek = () => tokens[i];
  const eat = (t?: string) => {
    const v = tokens[i];
    if (t && v !== t) throw new Error("Invalid expression");
    i += 1;
    return v;
  };
  const used: number[] = [];

  const parsePrimary = (): number => {
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

  const parseMul = (): number => {
    let v = parsePrimary();
    while (peek() === "*" || peek() === "/") {
      const op = eat();
      const r = parsePrimary();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  };

  const parseAdd = (): number => {
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

export function checkSolution(nums: number[], expr: string): { ok: boolean; value?: number; error?: string } {
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

export function shuffleDeck(): number[] {
  const deck = shuffle(Array.from({ length: 40 }, (_, i) => (i % 10) + 1));
  return deck;
}

export type M24DuelState = {
  mode: "duel";
  players: Array<{ id: string; name: string }>;
  nums: number[];
  solution: string;
  scores: Record<string, number>;
  phase: "play" | "over";
  round: number;
  goal: number;
  winnerId: string | null;
  message: string;
};

export function startM24Practice(): M24DuelState {
  const state = startM24Duel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU" });
  return { ...state, message: "Practice vs CPU. The CPU submits in about 8 seconds. Make 24 first." };
}

export function startM24Duel(a: { id: string; name: string }, b: { id: string; name: string }): M24DuelState {
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
    message: "Same cards. First to make 24 scores. First to 3 points.",
  };
}

export type M24DuelAction = { type: "submit"; expr: string };

export function applyM24Action(state: M24DuelState, actorId: string, action: M24DuelAction): M24DuelState {
  if (state.phase !== "play") return state;
  if (!state.players.some((p) => p.id === actorId)) return state;
  if (action.type !== "submit") return state;
  const res = checkSolution(state.nums, action.expr);
  const actor = state.players.find((p) => p.id === actorId);
  if (!res.ok) {
    return { ...state, message: `${actor?.name || "Player"}: ${res.error}` };
  }
  const scores = { ...state.scores, [actorId]: (state.scores[actorId] || 0) + 1 };
  if (scores[actorId]! >= state.goal) {
    return {
      ...state,
      scores,
      phase: "over",
      winnerId: actorId,
      message: `${actor?.name} made 24. First to ${state.goal} wins.`,
    };
  }
  const puzzle = newPuzzle();
  return {
    ...state,
    scores,
    nums: puzzle.nums,
    solution: puzzle.solution,
    round: state.round + 1,
    message: `${actor?.name} scores! ${scores[actorId]} / ${state.goal}. Next hand.`,
  };
}

export function viewM24(state: M24DuelState, _viewerId: string): M24DuelState {
  return { ...state, solution: state.phase === "over" ? state.solution : "" };
}
