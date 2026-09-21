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
    throw new Error(`无法识别的符号：${ch}`);
  }
  return out;
}

function parseExpr(tokens: string[]): { value: number; used: number[] } {
  let i = 0;
  const peek = () => tokens[i];
  const eat = (t?: string) => {
    const v = tokens[i];
    if (t && v !== t) throw new Error("表达式不合法");
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
    throw new Error("表达式不合法");
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
  if (i !== tokens.length) throw new Error("表达式不完整");
  return { value, used };
}

export function checkSolution(nums: number[], expr: string): { ok: boolean; value?: number; error?: string } {
  try {
    const { value, used } = parseExpr(tokenize(expr));
    const a = [...used].sort((x, y) => x - y);
    const b = [...nums].sort((x, y) => x - y);
    if (a.length !== b.length || a.some((n, i) => n !== b[i])) {
      return { ok: false, error: "必须用完这四张牌，且每张只用一次。" };
    }
    if (!Number.isFinite(value) || Math.abs(value - 24) > 1e-6) {
      return { ok: false, value, error: `结果是 ${Number(value.toFixed(4))}，不是 24。` };
    }
    return { ok: true, value: 24 };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "无法计算" };
  }
}

export function shuffleDeck(): number[] {
  const deck = shuffle(Array.from({ length: 40 }, (_, i) => (i % 10) + 1));
  return deck;
}
