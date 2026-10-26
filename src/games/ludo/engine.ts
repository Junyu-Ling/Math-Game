import { uid } from "../../lib/shuffle";

/**
 * Chinese airplane chess (飞行棋).
 * 15×15 cross: shared counter-clockwise track of 52, then 6 private home squares.
 * Bases: red top-left, blue top-right, green bottom-right, yellow bottom-left.
 * Home columns run into the center star: red down from the top, blue left from the
 * right, green up from the bottom, yellow right from the left.
 * Relative pos: -1 hangar, 0 ready square, 1–50 rest of the outer track,
 * 51–55 home approach, 56 center (exact roll).
 * Landing exactly on relative 17 flies to relative 31 along that color's dotted line.
 */

export const COLORS = ["blue", "red", "yellow", "green"] as const;
export type FlyColor = (typeof COLORS)[number];

export const TRACK: ReadonlyArray<readonly [number, number]> = [
  [0, 6], [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6],
];

/** Blue, red, yellow, green — index of each ready square on TRACK. */
export const START_AT = [12, 51, 38, 25] as const;

/**
 * Six home squares per color, last one is the star point.
 * Blue from the right, red from the top, yellow from the left, green from the bottom.
 */
export const HOME: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
];

export const FLY_FROM = 17;
export const FLY_TO = 31;
export const LAST_OUTER = 50;
export const FINISH = 56;
export const MAX_SIXES = 3;

const PAINT: FlyColor[] = ["red", "yellow", "blue", "green"];

export type LPlane = { id: string; slot: number; pos: number };
export type LPlayer = { id: string; name: string; human: boolean; color: FlyColor; planes: LPlane[]; out?: boolean };
export type LState = {
  players: LPlayer[];
  turn: number;
  dice: number | null;
  /** Sixes already resolved earlier in this turn. */
  sixes: number;
  phase: "lobby" | "roll" | "move" | "over";
  winnerId: string | null;
  log: Array<{ id: string; text: string }>;
};
export type LAction = { type: "roll" } | { type: "move"; pieceId: string } | { type: "start" };

type Landing = { pos: number; flew: boolean; captures: string[] };
type Dir = "e" | "s" | "w" | "n";

function mod(index: number, n: number): number {
  return ((index % n) + n) % n;
}

function trackCell(index: number): readonly [number, number] {
  const n = TRACK.length;
  return TRACK[mod(index, n)] ?? [0, 6];
}

export function trackColor(index: number): FlyColor {
  return PAINT[index % PAINT.length] ?? "blue";
}

export function startTrackIndex(colorIdx: number): number {
  return START_AT[colorIdx] ?? 0;
}

export function trackIndex(colorIdx: number, pos: number): number | null {
  if (pos < 0 || pos > LAST_OUTER) return null;
  return mod(startTrackIndex(colorIdx) - pos, TRACK.length);
}

export function planeCell(colorIdx: number, pos: number): { r: number; c: number } | null {
  if (pos < 0) return null;
  if (pos <= LAST_OUTER) {
    const cell = trackCell(trackIndex(colorIdx, pos) ?? 0);
    return { r: cell[0], c: cell[1] };
  }
  if (pos > FINISH) return null;
  const cell = HOME[colorIdx]?.[pos - (LAST_OUTER + 1)];
  if (!cell) return null;
  return { r: cell[0], c: cell[1] };
}

function dirOf(dr: number, dc: number): Dir {
  if (Math.abs(dc) > Math.abs(dr)) return dc > 0 ? "e" : "w";
  return dr > 0 ? "s" : "n";
}

export function trackDir(index: number): Dir {
  const here = trackCell(index);
  const next = trackCell(index - 1);
  return dirOf(next[0] - here[0], next[1] - here[1]);
}

export function flyTrackIndex(colorIdx: number): number {
  return mod(startTrackIndex(colorIdx) - FLY_FROM, TRACK.length);
}

export function flyDir(colorIdx: number): Dir {
  const from = trackCell(flyTrackIndex(colorIdx));
  const to = trackCell(mod(startTrackIndex(colorIdx) - FLY_TO, TRACK.length));
  return dirOf(to[0] - from[0], to[1] - from[1]);
}

export function homeDir(colorIdx: number): Dir {
  return (["w", "s", "e", "n"] as const)[colorIdx] ?? "w";
}

export function planeHeading(colorIdx: number, pos: number): number {
  if (pos < 0) return [180, 90, 180, -90][colorIdx] ?? 0;
  if (pos >= FINISH) return [180, 90, 0, -90][colorIdx] ?? 0;
  const here = planeCell(colorIdx, pos);
  const next = planeCell(colorIdx, pos + 1);
  if (!here || !next) return 0;
  const dir = dirOf(next.r - here.r, next.c - here.c);
  if (dir === "e") return 0;
  if (dir === "s") return 90;
  if (dir === "w") return 180;
  return -90;
}

export function homeCount(player: LPlayer): number {
  return player.planes.filter((p) => p.pos === FINISH).length;
}

function colorIdxOf(player: LPlayer): number {
  const i = COLORS.indexOf(player.color);
  return i < 0 ? 0 : i;
}

function occupants(state: LState, abs: number, ignoreId: string) {
  const found: Array<{ playerIdx: number; plane: LPlane }> = [];
  state.players.forEach((pl, playerIdx) => {
    const ci = colorIdxOf(pl);
    for (const plane of pl.planes) {
      if (plane.id === ignoreId) continue;
      if (trackIndex(ci, plane.pos) === abs) found.push({ playerIdx, plane });
    }
  });
  return found;
}

function landingAt(state: LState, moverIdx: number, abs: number, ignoreId: string): { blocked: boolean; captures: string[] } {
  const foes = occupants(state, abs, ignoreId).filter((o) => o.playerIdx !== moverIdx);
  if (foes.length >= 2) return { blocked: true, captures: [] };
  if (foes.length === 1) return { blocked: false, captures: [foes[0]!.plane.id] };
  return { blocked: false, captures: [] };
}

function planMove(state: LState, moverIdx: number, plane: LPlane, dice: number): Landing | null {
  const ci = colorIdxOf(state.players[moverIdx]!);
  if (plane.pos < 0) {
    if (dice !== 6) return null;
    const gate = landingAt(state, moverIdx, trackIndex(ci, 0) ?? 0, plane.id);
    if (gate.blocked) return null;
    return { pos: 0, flew: false, captures: gate.captures };
  }
  if (plane.pos >= FINISH) return null;
  const raw = plane.pos + dice;
  if (raw > FINISH) return null;
  if (raw > LAST_OUTER) return { pos: raw, flew: false, captures: [] };
  if (raw === FLY_FROM) {
    const entrance = landingAt(state, moverIdx, trackIndex(ci, FLY_FROM) ?? 0, plane.id);
    if (entrance.blocked) return null;
    const exit = landingAt(state, moverIdx, trackIndex(ci, FLY_TO) ?? 0, plane.id);
    if (!exit.blocked) {
      return { pos: FLY_TO, flew: true, captures: [...entrance.captures, ...exit.captures] };
    }
    return { pos: FLY_FROM, flew: false, captures: entrance.captures };
  }
  const land = landingAt(state, moverIdx, trackIndex(ci, raw) ?? 0, plane.id);
  if (land.blocked) return null;
  return { pos: raw, flew: false, captures: land.captures };
}

export function legalMoves(state: LState, playerIdx: number): string[] {
  if (state.phase !== "move" || state.dice == null) return [];
  const me = state.players[playerIdx];
  if (!me) return [];
  const out: string[] = [];
  for (const plane of me.planes) {
    if (planMove(state, playerIdx, plane, state.dice)) out.push(plane.id);
  }
  return out;
}

function makePlayer(p: { id: string; name: string; human?: boolean }, index: number): LPlayer {
  const color = COLORS[index] ?? "blue";
  return {
    id: p.id,
    name: p.name,
    human: p.human !== false,
    color,
    planes: [0, 1, 2, 3].map((slot) => ({ id: uid(`p${index}${slot}`), slot, pos: -1 })),
  };
}

export function startLudoLobby(people: Array<{ id: string; name: string; human?: boolean }>): LState {
  const players = people.slice(0, 4).map(makePlayer);
  return {
    players,
    turn: 0,
    dice: null,
    sixes: 0,
    phase: "lobby",
    winnerId: null,
    log: [{ id: uid("l"), text: `Table ${players.length}/4. Host starts at 2–4. Roll 6 to take off.` }],
  };
}

export function startLudoTable(people: Array<{ id: string; name: string; human?: boolean }>): LState {
  const seated = people.slice(0, 4);
  if (seated.length < 2) return startLudoLobby(seated);
  const players = seated.map(makePlayer);
  return {
    players,
    turn: 0,
    dice: null,
    sixes: 0,
    phase: "roll",
    winnerId: null,
    log: [
      {
        id: uid("l"),
        text: `${players.map((p) => `${p.name} (${p.color})`).join(" · ")}. Roll 6 to leave the hangar. First to bring all 4 planes home wins.`,
      },
    ],
  };
}

export function startLudoPractice(seats = 2): LState {
  const n = Math.max(2, Math.min(4, Math.floor(seats) || 2));
  const names = ["CPU", "CPU 2", "CPU 3"];
  return startLudoTable(
    Array.from({ length: n }, (_, i) => ({
      id: i === 0 ? "you" : `cpu-${i}`,
      name: i === 0 ? "YOU" : names[i - 1]!,
      human: i === 0,
    })),
  );
}

export function startLudoDuel(
  a: { id: string; name: string; human?: boolean },
  b: { id: string; name: string; human?: boolean },
): LState {
  return startLudoTable([
    { id: a.id, name: a.name, human: a.human !== false },
    { id: b.id, name: b.name, human: b.human !== false },
  ]);
}

function nextSeat(state: LState, from: number): number {
  const n = Math.max(1, state.players.length);
  for (let step = 1; step <= n; step++) {
    const i = (from + step) % n;
    if (!state.players[i]?.out) return i;
  }
  return from;
}

function endTurn(state: LState, log: LState["log"]): LState {
  return { ...state, log, phase: "roll", sixes: 0, turn: nextSeat(state, state.turn) };
}

export function leaveLudo(state: LState, leaverId: string): LState {
  if (state.phase === "lobby" || state.phase === "over") return state;
  const leaver = state.players.find((p) => p.id === leaverId);
  if (!leaver || leaver.out) return state;
  const players = state.players.map((p) => (p.id === leaverId ? { ...p, out: true } : p));
  let next: LState = {
    ...state,
    players,
    log: [...state.log, { id: `left-${leaverId}`, text: `${leaver.name} left and loses.` }],
  };
  const remain = players.filter((p) => !p.out);
  if (remain.length <= 1) {
    return {
      ...next,
      phase: "over",
      winnerId: remain[0]?.id ?? null,
      log: [...next.log, { id: `win-${leaverId}`, text: remain[0] ? `${remain[0].name} wins.` : `${leaver.name} left.` }],
    };
  }
  if (next.players[next.turn]?.out) next = { ...next, phase: "roll", sixes: 0, dice: null, turn: nextSeat(next, next.turn) };
  return next;
}

function applyLanding(state: LState, moverIdx: number, planeId: string, landing: Landing): LPlayer[] {
  const capture = new Set(landing.captures);
  return state.players.map((pl, pi) => ({
    ...pl,
    planes: pl.planes.map((plane) => {
      if (capture.has(plane.id)) return { ...plane, pos: -1 };
      if (pi === moverIdx && plane.id === planeId) return { ...plane, pos: landing.pos };
      return plane;
    }),
  }));
}

function capturedNames(state: LState, ids: string[]): string[] {
  const names: string[] = [];
  for (const id of ids) {
    const owner = state.players.find((p) => p.planes.some((pl) => pl.id === id));
    if (owner && !names.includes(owner.name)) names.push(owner.name);
  }
  return names;
}

export function applyLudoRoll(state: LState, actorId: string, dice: number): LState {
  if (state.phase === "over" || state.phase === "lobby") return state;
  const me = state.players[state.turn];
  if (!me || me.id !== actorId) return state;
  if (state.phase === "move") {
    if (legalMoves(state, state.turn).length === 0) {
      return endTurn(state, [...state.log, { id: uid("l"), text: "No legal move." }]);
    }
    return state;
  }
  const face = Math.trunc(dice);
  if (face < 1 || face > 6) return state;
  const rolled: LState = {
    ...state,
    dice: face,
    phase: "move",
    log: [...state.log, { id: uid("l"), text: `${me.name} rolls ${face}.` }],
  };
  if (legalMoves(rolled, state.turn).length === 0) {
    return endTurn(rolled, [...rolled.log, { id: uid("l"), text: "No legal move." }]);
  }
  return rolled;
}

export function applyLudoAction(state: LState, actorId: string, action: LAction): LState {
  if (state.phase === "over") return state;
  if (!state.players.some((p) => p.id === actorId)) return state;

  if (state.phase === "lobby") {
    if (action.type === "start" && state.players[0]?.id === actorId && state.players.length >= 2) {
      return startLudoTable(state.players);
    }
    return state;
  }

  const me = state.players[state.turn];
  if (!me || me.id !== actorId) return state;

  if (action.type === "roll") {
    const face = 1 + Math.floor(Math.random() * 6);
    return applyLudoRoll(state, actorId, face);
  }

  if (action.type !== "move" || state.phase !== "move" || state.dice == null) return state;
  const plane = me.planes.find((p) => p.id === action.pieceId);
  if (!plane) return state;
  const landing = planMove(state, state.turn, plane, state.dice);
  if (!landing) return state;

  const players = applyLanding(state, state.turn, plane.id, landing);
  const mover = players[state.turn];
  const parked = mover ? homeCount(mover) : 0;
  const sent = capturedNames(state, landing.captures);
  const won = Boolean(mover && mover.planes.every((p) => p.pos === FINISH));
  let text = plane.pos < 0 ? `${me.name} takes off` : landing.pos === FINISH ? `${me.name} parks a plane (${parked}/4)` : `${me.name} moves`;
  if (landing.flew) text += " · flies the dotted shortcut";
  if (sent.length) text += ` · sends ${sent.join(" & ")} back to the hangar`;
  text += ".";
  if (!won && state.dice === 6 && state.sixes + 1 < MAX_SIXES) text += " Rolls again.";
  if (!won && state.dice === 6 && state.sixes + 1 >= MAX_SIXES) text += " Three sixes — turn passes.";
  const log = [...state.log, { id: uid("l"), text }];

  if (won && mover) {
    return {
      ...state,
      players,
      phase: "over",
      winnerId: mover.id,
      sixes: 0,
      log: [...log, { id: uid("l"), text: `${mover.name} brings all 4 planes home.` }],
    };
  }
  const moved: LState = { ...state, players, log };
  if (state.dice === 6 && state.sixes + 1 < MAX_SIXES) {
    return { ...moved, phase: "roll", turn: state.turn, sixes: state.sixes + 1 };
  }
  return endTurn(moved, log);
}

export function viewLudo(state: LState, _viewerId: string): LState {
  return state;
}

export function aiLudo(state: LState): LAction {
  if (state.phase !== "move" || state.dice == null) return { type: "roll" };
  const me = state.players[state.turn];
  const moves = legalMoves(state, state.turn);
  if (!me || moves.length === 0) return { type: "roll" };
  let best = moves[0]!;
  let bestScore = -Infinity;
  for (const id of moves) {
    const plane = me.planes.find((p) => p.id === id);
    if (!plane) continue;
    const landing = planMove(state, state.turn, plane, state.dice);
    if (!landing) continue;
    let score = landing.pos;
    if (landing.pos === FINISH) score += 2000;
    if (landing.captures.length) score += 800;
    if (landing.flew) score += 500;
    if (plane.pos < 0) score += 450;
    if (score > bestScore) {
      bestScore = score;
      best = id;
    }
  }
  return { type: "move", pieceId: best };
}
