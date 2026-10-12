/**
 * RAPFI (Gomocup) bridge — optional strong Gomoku CPU.
 *
 * Set RAPFI_PATH to the engine binary (e.g. pbrain-rapfi.exe / pbrain-rapfi).
 * Downloads: https://github.com/dhbloo/rapfi/releases
 *
 * When unset or the process fails, callers should fall back to the JS AI.
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SIZE = 15;
/** Renju (matches our black-foul rules). Gomocup: 0 freestyle, 1 standard, 4 renju. */
const RULE_RENJU = 4;
const DEFAULT_TURN_MS = Number(process.env.RAPFI_TURN_MS || 2500);

let child = null;
let buf = "";
let waiters = [];
let queue = Promise.resolve();
let started = false;

function enginePath() {
  const fromEnv = String(process.env.RAPFI_PATH || "").trim();
  if (fromEnv) return fromEnv;
  const local = [
    path.join(__dirname, "engines", "pbrain-rapfi.exe"),
    path.join(__dirname, "engines", "pbrain-rapfi"),
    path.join(__dirname, "engines", "rapfi.exe"),
    path.join(__dirname, "engines", "rapfi"),
  ];
  return local.find((p) => existsSync(p)) || "";
}

export function rapfiAvailable() {
  const p = enginePath();
  return Boolean(p && existsSync(p));
}

function write(line) {
  if (!child?.stdin?.writable) throw new Error("RAPFI stdin closed");
  child.stdin.write(`${line}\n`);
}

function killEngine() {
  started = false;
  buf = "";
  const c = child;
  child = null;
  if (!c) return;
  try {
    c.kill();
  } catch {
    /* ignore */
  }
}

function onLine(line) {
  const t = String(line || "").trim();
  if (!t) return;
  // Ignore chatter / DEBUG / MESSAGE / OK / UNKNOWN
  if (/^(OK|MESSAGE|DEBUG|UNKNOWN|ERROR|SUGGEST)/i.test(t)) return;
  const m = /^(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(t);
  if (!m) return;
  const r = Number(m[2]);
  const c = Number(m[1]);
  // Gomocup is x,y → we store as r=y, c=x
  const waiter = waiters.shift();
  if (waiter) waiter.resolve({ r, c });
}

function attach(proc) {
  child = proc;
  buf = "";
  proc.stdout.setEncoding("utf8");
  proc.stderr.setEncoding("utf8");
  proc.stdout.on("data", (chunk) => {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      onLine(line.replace(/\r$/, ""));
    }
  });
  proc.stderr.on("data", () => {});
  proc.on("exit", () => {
    started = false;
    child = null;
    while (waiters.length) {
      waiters.shift().reject(new Error("RAPFI exited"));
    }
  });
}

async function ensureStarted() {
  if (child && started) return;
  const bin = enginePath();
  if (!bin || !existsSync(bin)) throw new Error("RAPFI_PATH not set");
  killEngine();
  const proc = spawn(bin, [], {
    cwd: path.dirname(bin),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  attach(proc);
  write(`START ${SIZE}`);
  write(`INFO timeout_turn ${DEFAULT_TURN_MS}`);
  write(`INFO timeout_match ${Math.max(60_000, DEFAULT_TURN_MS * 40)}`);
  write(`INFO max_memory ${256 * 1024 * 1024}`);
  write("INFO game_type 1");
  write(`INFO rule ${RULE_RENJU}`);
  started = true;
}

function expectMove(timeoutMs) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      waiters = waiters.filter((w) => w !== entry);
      reject(new Error("RAPFI timeout"));
    }, timeoutMs);
    const entry = {
      resolve: (v) => {
        clearTimeout(t);
        resolve(v);
      },
      reject: (e) => {
        clearTimeout(t);
        reject(e);
      },
    };
    waiters.push(entry);
  });
}

/**
 * @param {number[][]} board 15×15, 0 empty, 1 black, 2 white
 * @param {1|2} aiStone
 * @returns {Promise<{r:number,c:number}|null>}
 */
export async function rapfiSuggest(board, aiStone) {
  if (!rapfiAvailable()) return null;

  const run = async () => {
    await ensureStarted();
    const stones = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const v = board[r]?.[c] || 0;
        if (v) stones.push({ r, c, v });
      }
    }

    const movePromise = expectMove(DEFAULT_TURN_MS + 4000);

    if (!stones.length && aiStone === 1) {
      write("BEGIN");
    } else {
      write("BOARD");
      for (const s of stones) {
        // Gomocup: x,y,color
        write(`${s.c},${s.r},${s.v}`);
      }
      write("DONE");
    }

    const move = await movePromise;
    if (
      !Number.isInteger(move.r) ||
      !Number.isInteger(move.c) ||
      move.r < 0 ||
      move.r >= SIZE ||
      move.c < 0 ||
      move.c >= SIZE ||
      board[move.r]?.[move.c]
    ) {
      throw new Error(`RAPFI illegal move ${move.c},${move.r}`);
    }
    return move;
  };

  const job = queue.then(run, run);
  queue = job.then(
    () => {},
    () => {
      killEngine();
    },
  );
  try {
    return await job;
  } catch (err) {
    console.error("[rapfi]", err?.message || err);
    killEngine();
    return null;
  }
}
