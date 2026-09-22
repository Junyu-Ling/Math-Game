import { shuffle, uid } from "../../lib/shuffle";

export type Color = "black" | "white";
export type CodaValue = number | "joker";

export type CodaTile = {
  id: string;
  color: Color;
  value: CodaValue;
  revealed: boolean;
};

export type CodaPlayer = {
  id: string;
  name: string;
  human: boolean;
  tiles: CodaTile[];
  stash: CodaTile | null;
  out: boolean;
};

export type CodaLog = { id: string; text: string; tone?: "you" | "ai" | "bad" };

export type CodaPhase = "arrange" | "rps" | "draw" | "guess" | "continue" | "over";
export type RpsThrow = "rock" | "paper" | "scissors";

export const ARRANGE_MS = 5000;
export const RPS_REVEAL_MS = 3400;
export const OPENING = 4;

export type RpsReveal = {
  aId: string;
  a: RpsThrow;
  bId: string;
  b: RpsThrow;
};

export type CodaState = {
  players: CodaPlayer[];
  deck: CodaTile[];
  turn: number;
  phase: CodaPhase;
  drawn: CodaTile | null;
  selected: { playerId: string; index: number } | null;
  useJokers: boolean;
  winnerId: string | null;
  log: CodaLog[];
  arrangeId: number;
  pending: CodaTile | null;
  pendingSlot: number | null;
  humanDraft: CodaTile[] | null;
  frozenRival: CodaTile[] | null;
  resume: "draw" | "next" | null;
  rpsThrows: Partial<Record<string, RpsThrow>>;
  rpsReveal: RpsReveal | null;
  stashSlots: Partial<Record<string, number>>;
  tried: Record<string, CodaValue[]>;
  leftByColor?: { black: number; white: number };
};

function makeNumberDeck(): CodaTile[] {
  const tiles: CodaTile[] = [];
  for (const color of ["black", "white"] as const) {
    for (let n = 0; n <= 11; n++) {
      tiles.push({ id: uid("t"), color, value: n, revealed: false });
    }
  }
  return shuffle(tiles);
}

function makeJokers(): CodaTile[] {
  return shuffle(
    (["black", "white"] as const).map((color) => ({
      id: uid("t"),
      color,
      value: "joker" as const,
      revealed: false,
    })),
  );
}

function takeByColor(deck: CodaTile[], color: Color, n: number): CodaTile[] {
  const out: CodaTile[] = [];
  for (let i = 0; i < n; i++) {
    const idx = deck.findIndex((t) => t.color === color && t.value !== "joker");
    if (idx < 0) break;
    out.push(deck.splice(idx, 1)[0]!);
  }
  return out;
}

function pickSlot(tiles: CodaTile[], card: CodaTile, preferred: number | null, random: boolean): number {
  const opts = insertIndices(tiles, card);
  if (preferred !== null && opts.includes(preferred)) return preferred;
  if (random && opts.length > 1) return opts[Math.floor(Math.random() * opts.length)]!;
  return opts[0] ?? tiles.length;
}

export function rank(tile: CodaTile): number {
  if (tile.value === "joker") return -1;
  return tile.value * 2 + (tile.color === "white" ? 1 : 0);
}

export function isSorted(tiles: CodaTile[]): boolean {
  const nums = tiles.filter((t) => t.value !== "joker");
  for (let i = 1; i < nums.length; i++) {
    const a = nums[i - 1];
    const b = nums[i];
    if (!a || !b) continue;
    if (rank(a) > rank(b)) return false;
  }
  return true;
}

export function insertIndices(tiles: CodaTile[], card: CodaTile): number[] {
  if (card.value === "joker") {
    return Array.from({ length: tiles.length + 1 }, (_, i) => i);
  }
  const found: number[] = [];
  for (let i = 0; i <= tiles.length; i++) {
    const trial = [...tiles];
    trial.splice(i, 0, card);
    if (isSorted(trial)) found.push(i);
  }
  return found.length ? found : [tiles.length];
}

function sortOpening(tiles: CodaTile[]): CodaTile[] {
  const jokers = tiles.filter((t) => t.value === "joker");
  const nums = tiles.filter((t) => t.value !== "joker").sort((a, b) => rank(a) - rank(b));
  return [...jokers, ...nums];
}

function emptyArrange() {
  return {
    pending: null as CodaTile | null,
    pendingSlot: null as number | null,
    humanDraft: null as CodaTile[] | null,
    frozenRival: null as CodaTile[] | null,
    resume: null as "draw" | "next" | null,
    rpsThrows: {} as Partial<Record<string, RpsThrow>>,
    rpsReveal: null as RpsReveal | null,
    stashSlots: {} as Partial<Record<string, number>>,
  };
}

function needsArrangeWait(inserter: CodaPlayer, pending: CodaTile | null): boolean {
  return Boolean(pending || inserter.stash);
}

function instantInsert(state: CodaState, pending: CodaTile | null, resume: "draw" | "next"): CodaState {
  const inserter = currentPlayer(state);
  let players = state.players;
  if (pending) {
    const slot = pickSlot(inserter.tiles, pending, null, !inserter.human);
    players = players.map((p) => (p.id === inserter.id ? insertInto(p, pending, slot) : p));
  }
  let next: CodaState = {
    ...state,
    players,
    drawn: null,
    selected: null,
    ...emptyArrange(),
  };
  next = checkEliminations(next);
  if (next.phase === "over") return next;
  if (resume === "next") return nextTurn(next);
  return { ...next, phase: "draw" };
}

function openingSplit(black: number, white: number): { black: number; white: number } {
  const b = Math.max(0, Math.min(OPENING, Math.floor(black)));
  const w = b + Math.max(0, Math.floor(white)) === OPENING ? Math.max(0, Math.floor(white)) : OPENING - b;
  return { black: b, white: w };
}

function pullOpeningJoker(player: CodaPlayer): CodaPlayer {
  const joker = player.tiles.find((t) => t.value === "joker");
  const nums = sortOpening(player.tiles.filter((t) => t.value !== "joker"));
  return { ...player, tiles: nums, stash: joker ?? null };
}

function scatterOpeningJokers(you: CodaPlayer, rival: CodaPlayer, deck: CodaTile[]) {
  for (const joker of makeJokers()) {
    const roll = Math.floor(Math.random() * 3);
    const who = roll === 0 ? you : roll === 1 ? rival : null;
    if (!who || who.tiles.some((t) => t.value === "joker") || who.tiles.length === 0) continue;
    const i = Math.floor(Math.random() * who.tiles.length);
    const removed = who.tiles.splice(i, 1)[0];
    if (removed) deck.push(removed);
    who.tiles.push(joker);
  }
}

export function startCodaMatch(
  useJokers: boolean,
  a: { id: string; name: string; black: number; white: number },
  b: { id: string; name: string; black: number; white: number },
): CodaState {
  const base = startCoda(useJokers, a.black, a.white);
  const deck = makeNumberDeck();
  const aSplit = openingSplit(a.black, a.white);
  const bSplit = openingSplit(b.black, b.white);
  const deal = (seat: { id: string; name: string }, n: { black: number; white: number }): CodaPlayer => ({
    id: seat.id,
    name: seat.name,
    human: true,
    tiles: sortOpening([...takeByColor(deck, "black", n.black), ...takeByColor(deck, "white", n.white)]),
    stash: null,
    out: false,
  });
  let you = deal(a, aSplit);
  let rival = deal(b, bSplit);
  if (useJokers) scatterOpeningJokers(you, rival, deck);
  you = pullOpeningJoker(you);
  rival = pullOpeningJoker(rival);
  const wait = Boolean(you.stash || rival.stash);
  const stashSlots: Partial<Record<string, number>> = {};
  if (you.stash) stashSlots[you.id] = insertIndices(you.tiles, you.stash)[0] ?? 0;
  if (rival.stash) stashSlots[rival.id] = insertIndices(rival.tiles, rival.stash)[0] ?? 0;
  return {
    ...base,
    players: [you, rival],
    deck: shuffle(deck),
    phase: wait ? "arrange" : "rps",
    drawn: wait ? you.stash : null,
    arrangeId: wait ? 1 : 0,
    pending: wait ? you.stash : null,
    pendingSlot: wait && you.stash ? (insertIndices(you.tiles, you.stash)[0] ?? 0) : null,
    humanDraft: wait ? you.tiles.map((t) => ({ ...t })) : null,
    frozenRival: wait ? rival.tiles.map((t) => ({ ...t })) : null,
    resume: wait ? "draw" : null,
    rpsThrows: {},
    rpsReveal: null,
    stashSlots,
    log: [
      {
        id: uid("l"),
        text: wait ? "Online opening: if anyone drew a dash, arrange for 5 seconds." : "Online opening of 4 tiles in hand. RPS — loser guesses first.",
      },
    ],
  };
}

export function startCoda(useJokers = true, youBlack = 2, youWhite = 2): CodaState {
  const deck = makeNumberDeck();
  const youSplit = openingSplit(youBlack, youWhite);
  const rivalSplit = openingSplit(2, 2);
  const deal = (name: string, human: boolean, b: number, w: number): CodaPlayer => {
    const tiles = sortOpening([...takeByColor(deck, "black", b), ...takeByColor(deck, "white", w)]);
    return { id: uid("p"), name, human, tiles, stash: null, out: false };
  };
  let you = deal("YOU", true, youSplit.black, youSplit.white);
  let rival = deal("RIVAL", false, rivalSplit.black, rivalSplit.white);
  if (useJokers) scatterOpeningJokers(you, rival, deck);
  you = pullOpeningJoker(you);
  rival = pullOpeningJoker(rival);
  const wait = Boolean(you.stash || rival.stash);
  const stashSlots: Partial<Record<string, number>> = {};
  if (you.stash) stashSlots[you.id] = insertIndices(you.tiles, you.stash)[0] ?? 0;
  if (rival.stash) stashSlots[rival.id] = insertIndices(rival.tiles, rival.stash)[0] ?? 0;
  return {
    players: [you, rival],
    deck: shuffle(deck),
    turn: 0,
    phase: wait ? "arrange" : "rps",
    drawn: wait ? you.stash : null,
    selected: null,
    useJokers,
    winnerId: null,
    arrangeId: wait ? 1 : 0,
    pending: wait ? you.stash : null,
    pendingSlot: wait && you.stash ? (insertIndices(you.tiles, you.stash)[0] ?? 0) : null,
    humanDraft: wait ? you.tiles.map((t) => ({ ...t })) : null,
    frozenRival: wait ? rival.tiles.map((t) => ({ ...t })) : null,
    resume: wait ? "draw" : null,
    rpsThrows: {},
    rpsReveal: null,
    stashSlots,
    tried: {},
    log: [
      {
        id: uid("l"),
        text: you.stash
          ? "Opening dash drawn. Insert, still 4 tiles, then lock."
          : wait
            ? "Opening 4 in hand. Rival drew a dash. Arrange, then RPS."
            : "Opening 4 in hand, no dash. RPS — loser guesses first.",
      },
    ],
  };
}

function enterArrange(state: CodaState, pending: CodaTile | null, resume: "draw" | "next"): CodaState {
  const inserter = currentPlayer(state);
  if (!needsArrangeWait(inserter, pending)) {
    return instantInsert(
      {
        ...state,
        log: [...state.log, { id: uid("l"), text: "Only one legal slot. Number inserts automatically." }],
      },
      pending,
      resume,
    );
  }
  const other = state.players.find((p) => p.id !== inserter.id) ?? state.players[1]!;
  const slot = pending ? pickSlot(inserter.tiles, pending, null, false) : null;
  return {
    ...state,
    phase: "arrange",
    drawn: pending,
    selected: null,
    arrangeId: state.arrangeId + 1,
    pending,
    pendingSlot: slot,
    humanDraft: inserter.tiles.map((t) => ({ ...t })),
    frozenRival: other.tiles.map((t) => ({ ...t })),
    resume,
    log: [
      ...state.log,
      {
        id: uid("l"),
        text:
          resume === "draw"
            ? "Opening arrange 5s: the tile stays out, then locks after insert."
            : "Arrange 5s: the new tile stays out. Wait out the timer even after you pick a slot.",
      },
    ],
  };
}

function alive(state: CodaState): CodaPlayer[] {
  return state.players.filter((p) => !p.out);
}

function checkEliminations(state: CodaState): CodaState {
  const players = state.players.map((p) => ({
    ...p,
    out: p.tiles.length > 0 && p.tiles.every((t) => t.revealed),
  }));
  const remaining = players.filter((p) => !p.out);
  if (remaining.length === 1 && remaining[0]) {
    return {
      ...state,
      players,
      phase: "over",
      winnerId: remaining[0].id,
      log: [...state.log, { id: uid("l"), text: `${remaining[0].name} still has a hidden code and wins.`, tone: "you" }],
    };
  }
  return { ...state, players };
}

function nextTurn(state: CodaState): CodaState {
  const living = alive(state);
  if (living.length <= 1) return checkEliminations(state);
  let i = state.turn;
  for (let n = 0; n < state.players.length; n++) {
    i = (i + 1) % state.players.length;
    const p = state.players[i];
    if (p && !p.out) {
      return { ...state, turn: i, phase: "draw", drawn: null, selected: null };
    }
  }
  return state;
}

export function currentPlayer(state: CodaState): CodaPlayer {
  return state.players[state.turn] ?? state.players[0]!;
}

export function deckCounts(state: Pick<CodaState, "deck" | "leftByColor">): { black: number; white: number } {
  if (state.leftByColor) return state.leftByColor;
  return {
    black: state.deck.filter((t) => t.color === "black").length,
    white: state.deck.filter((t) => t.color === "white").length,
  };
}

export function aiDrawColor(state: CodaState): Color {
  const { black, white } = deckCounts(state);
  if (black <= 0 && white <= 0) return "black";
  if (black <= 0) return "white";
  if (white <= 0) return "black";
  return Math.random() < 0.5 ? "black" : "white";
}

export function drawCard(state: CodaState, color?: Color): CodaState {
  if (state.phase !== "draw") return state;
  if (state.deck.length === 0) {
    return { ...state, phase: "guess", drawn: null, log: [...state.log, { id: uid("l"), text: "Deck is empty. Guess now." }] };
  }
  const want = color ?? aiDrawColor(state);
  const idx = state.deck.findIndex((t) => t.color === want);
  if (idx < 0) return state;
  const card = state.deck[idx];
  if (!card) return state;
  const rest = state.deck.filter((_, i) => i !== idx);
  const who = currentPlayer(state).name;
  const colorName = want === "black" ? "black" : "white";
  return {
    ...state,
    deck: rest,
    drawn: { ...card, revealed: false },
    phase: "guess",
    log: [...state.log, { id: uid("l"), text: `${who} draws a ${colorName} tile.`, tone: currentPlayer(state).human ? "you" : "ai" }],
  };
}

export function selectTile(state: CodaState, playerId: string, index: number): CodaState {
  if (state.phase !== "guess") return state;
  const me = currentPlayer(state);
  if (playerId === me.id) return state;
  const target = state.players.find((p) => p.id === playerId);
  const tile = target?.tiles[index];
  if (!tile || tile.revealed) return state;
  return { ...state, selected: { playerId, index } };
}

function tileMatches(tile: CodaTile, guess: CodaValue): boolean {
  return tile.value === guess;
}

export function triedOnTile(state: Pick<CodaState, "players" | "tried">, playerId: string, index: number): CodaValue[] {
  const tile = state.players.find((p) => p.id === playerId)?.tiles[index];
  if (!tile) return [];
  return (state.tried ?? {})[tile.id] ?? [];
}

function rememberGuess(state: CodaState, tileId: string, guess: CodaValue): Record<string, CodaValue[]> {
  const prev = (state.tried ?? {})[tileId] ?? [];
  if (prev.some((v) => v === guess)) return state.tried;
  return { ...(state.tried ?? {}), [tileId]: [...prev, guess] };
}

function insertInto(player: CodaPlayer, card: CodaTile, index?: number): CodaPlayer {
  const idx = index ?? insertIndices(player.tiles, card)[0] ?? player.tiles.length;
  const tiles = [...player.tiles];
  tiles.splice(idx, 0, card);
  return { ...player, tiles };
}

export function guessTile(state: CodaState, guess: CodaValue): CodaState {
  if (state.phase !== "guess" || !state.selected) return state;
  const target = state.players.find((p) => p.id === state.selected?.playerId);
  const tile = target?.tiles[state.selected.index];
  if (!target || !tile) return state;
  if ((state.tried?.[tile.id] ?? []).some((v) => v === guess)) return state;
  const me = currentPlayer(state);
  const label = guess === "joker" ? "Joker" : `${tile.color === "black" ? "black" : "white"} ${guess}`;
  const hit = tileMatches(tile, guess);
  const tried = rememberGuess(state, tile.id, guess);

  if (hit) {
    const players = state.players.map((p) =>
      p.id !== target.id
        ? p
        : {
            ...p,
            tiles: p.tiles.map((t, i) => (i === state.selected?.index ? { ...t, revealed: true } : t)),
          },
    );
    let next: CodaState = {
      ...state,
      tried,
      players,
      selected: null,
      phase: "continue",
      log: [
        ...state.log,
        { id: uid("l"), text: `${me.name} guessed ${target.name}'s ${label}.`, tone: me.human ? "you" : "ai" },
      ],
    };
    next = checkEliminations(next);
    if (next.phase === "over") return next;
    const stillHidden = next.players.some((p) => p.id !== me.id && !p.out && p.tiles.some((t) => !t.revealed));
    if (!stillHidden) return stay(next);
    return next;
  }

  const revealedDrawn = state.drawn ? { ...state.drawn, revealed: true } : null;
  if (revealedDrawn) {
    return enterArrange(
      {
        ...state,
        tried,
        selected: null,
        log: [
          ...state.log,
          { id: uid("l"), text: `${me.name} missed (${label}). Drawn tile is shown. Arrange.`, tone: "bad" },
        ],
      },
      revealedDrawn,
      "next",
    );
  }
  let next: CodaState = {
    ...state,
    tried,
    drawn: null,
    selected: null,
    log: [...state.log, { id: uid("l"), text: `${me.name} missed (${label}).`, tone: "bad" }],
  };
  next = checkEliminations(next);
  if (next.phase === "over") return next;
  return nextTurn(next);
}

export function continueGuess(state: CodaState): CodaState {
  if (state.phase !== "continue") return state;
  return { ...state, phase: "guess", selected: null };
}

export function stay(state: CodaState): CodaState {
  if (state.phase !== "continue" && state.phase !== "guess") return state;
  const me = currentPlayer(state);
  if (!state.drawn) return nextTurn({ ...state, phase: "draw" });
  const hidden = { ...state.drawn, revealed: false };
  return enterArrange(
    {
      ...state,
      selected: null,
      log: [...state.log, { id: uid("l"), text: `${me.name} stays. Arrange.` }],
    },
    hidden,
    "next",
  );
}

export function setPendingSlot(state: CodaState, index: number, actorId?: string): CodaState {
  if (state.phase !== "arrange") return state;
  const actor = actorId ? state.players.find((p) => p.id === actorId) : currentPlayer(state);
  if (!actor) return state;
  if (actor.stash && state.resume === "draw") {
    const allowed = insertIndices(actor.tiles, actor.stash);
    if (!allowed.includes(index)) return state;
    const next: CodaState = {
      ...state,
      stashSlots: { ...state.stashSlots, [actor.id]: index },
    };
    if (state.pending && state.pending.id === actor.stash.id) next.pendingSlot = index;
    return next;
  }
  if (!state.pending || actor.id !== currentPlayer(state).id) return state;
  const row = state.humanDraft ?? actor.tiles;
  const allowed = insertIndices(row, state.pending);
  if (!allowed.includes(index)) return state;
  return { ...state, pendingSlot: index };
}

function settleStash(player: CodaPlayer, preferred: number | null): CodaPlayer {
  if (!player.stash) return player;
  const slot = pickSlot(player.tiles, player.stash, preferred, !player.human);
  return { ...insertInto(player, player.stash, slot), stash: null };
}

export function finishArrange(state: CodaState): CodaState {
  if (state.phase !== "arrange") return state;
  const inserterId = (state.players[state.turn] ?? state.players[0])?.id;
  let players = state.players.map((p) =>
    p.id === inserterId && state.humanDraft ? { ...p, tiles: state.humanDraft, stash: p.stash } : p,
  );

  if (state.pending) {
    const inserter = players[state.turn] ?? players[0]!;
    const preferred = state.stashSlots[inserter.id] ?? state.pendingSlot;
    const slot = pickSlot(inserter.tiles, state.pending, preferred, !inserter.human);
    players = players.map((p) => {
      if (p.id !== inserter.id) return p;
      const next = insertInto(p, state.pending!, slot);
      const stash = p.stash && p.stash.id === state.pending?.id ? null : p.stash;
      return { ...next, stash };
    });
  }

  players = players.map((p) =>
    settleStash(p, state.stashSlots[p.id] ?? (p.id === (players[state.turn]?.id) ? state.pendingSlot : null)),
  );

  let next: CodaState = {
    ...state,
    players,
    drawn: null,
    ...emptyArrange(),
  };
  next = checkEliminations(next);
  if (next.phase === "over") return next;
  if (state.resume === "next") return nextTurn(next);
  return {
    ...next,
    phase: "rps",
    log: [...next.log, { id: uid("l"), text: "Arrange done. Tiles locked. RPS — loser guesses first." }],
  };
}

const RPS_LABEL: Record<RpsThrow, string> = { rock: "rock", paper: "paper", scissors: "scissors" };

function rpsWins(a: RpsThrow, b: RpsThrow): boolean {
  return (
    (a === "rock" && b === "scissors") ||
    (a === "paper" && b === "rock") ||
    (a === "scissors" && b === "paper")
  );
}

function beginRpsReveal(state: CodaState, aId: string, a: RpsThrow, bId: string, b: RpsThrow): CodaState {
  return {
    ...state,
    rpsThrows: { [aId]: a, [bId]: b },
    rpsReveal: { aId, a, bId, b },
  };
}

export function finishRps(state: CodaState): CodaState {
  if (state.phase !== "rps" || !state.rpsReveal) return state;
  const { aId, a, bId, b } = state.rpsReveal;
  if (a === b) {
    return {
      ...state,
      rpsThrows: {},
      rpsReveal: null,
      log: [...state.log, { id: uid("l"), text: `Tie, both ${RPS_LABEL[a]}. Throw again.` }],
    };
  }
  const loserId = rpsWins(a, b) ? bId : aId;
  const loserTurn = state.players.findIndex((p) => p.id === loserId);
  return {
    ...state,
    turn: loserTurn >= 0 ? loserTurn : 0,
    phase: "draw",
    drawn: null,
    selected: null,
    rpsThrows: {},
    rpsReveal: null,
    log: [
      ...state.log,
      {
        id: uid("l"),
        text: `${state.players.find((p) => p.id === aId)?.name} ${RPS_LABEL[a]} vs ${state.players.find((p) => p.id === bId)?.name} ${RPS_LABEL[b]}. Loser guesses first.`,
      },
    ],
  };
}

export function playRps(state: CodaState, you: RpsThrow, actorId?: string): CodaState {
  if (state.phase !== "rps" || state.rpsReveal) return state;
  const me = actorId ? state.players.find((p) => p.id === actorId) : state.players.find((p) => p.human);
  const foe = state.players.find((p) => p.id !== me?.id);
  if (!me || !foe) return state;
  if (state.rpsThrows[me.id]) return state;
  if (!foe.human) {
    const ai = (["rock", "paper", "scissors"] as const)[Math.floor(Math.random() * 3)]!;
    return beginRpsReveal(state, me.id, you, foe.id, ai);
  }
  const theirs = state.rpsThrows[foe.id];
  if (!theirs) {
    return {
      ...state,
      rpsThrows: { ...state.rpsThrows, [me.id]: you },
      log: [...state.log, { id: uid("l"), text: `${me.name} is ready. Waiting for the other hand.` }],
    };
  }
  return beginRpsReveal({ ...state, rpsThrows: { ...state.rpsThrows, [me.id]: you } }, me.id, you, foe.id, theirs);
}

export function placeDrawn(state: CodaState, index: number): CodaState {
  return setPendingSlot(state, index);
}

export function possibleValues(player: CodaPlayer, index: number): CodaValue[] {
  const tile = player.tiles[index];
  if (!tile) return [];
  const left = player.tiles.slice(0, index).filter((t) => t.value !== "joker");
  const right = player.tiles.slice(index + 1).filter((t) => t.value !== "joker");
  const min = left.length ? rank(left[left.length - 1]!) + 1 : 0;
  const max = right.length ? rank(right[0]!) - 1 : 23;
  const all: CodaValue[] = [];
  for (let n = 0; n <= 11; n++) {
    const r = n * 2 + (tile.color === "white" ? 1 : 0);
    if (r >= min && r <= max) all.push(n);
  }
  all.push("joker");
  return all;
}

export function aiGuess(state: CodaState): { playerId: string; index: number; value: CodaValue } | null {
  const me = currentPlayer(state);
  const targets = state.players.filter((p) => p.id !== me.id && !p.out);
  let best: { playerId: string; index: number; value: CodaValue; score: number } | null = null;
  for (const p of targets) {
    for (let index = 0; index < p.tiles.length; index++) {
      const tile = p.tiles[index];
      if (!tile || tile.revealed) continue;
      const used = new Set((state.tried?.[tile.id] ?? []).map((v) => String(v)));
      const opts = possibleValues(p, index).filter((v) => !used.has(String(v)));
      if (!opts.length) continue;
      const nums = opts.filter((v): v is number => v !== "joker");
      const pick = nums.length ? nums[Math.floor(nums.length / 2)]! : opts[0]!;
      const score = 100 - opts.length;
      if (!best || score > best.score) best = { playerId: p.id, index, value: pick, score };
    }
  }
  if (!best) return null;
  return { playerId: best.playerId, index: best.index, value: best.value };
}

export function formatTile(tile: CodaTile, hidden: boolean): string {
  if (hidden && !tile.revealed) return tile.color === "black" ? "black" : "white";
  if (tile.value === "joker") return tile.color === "black" ? "black -" : "white -";
  return `${tile.color === "black" ? "black" : "white"} ${tile.value}`;
}

export type CodaAction =
  | { type: "draw"; color?: Color }
  | { type: "select"; playerId: string; index: number }
  | { type: "guess"; value: CodaValue }
  | { type: "continue" }
  | { type: "stay" }
  | { type: "slot"; index: number }
  | { type: "rps"; throw: RpsThrow };

function isActorTurn(state: CodaState, actorId: string): boolean {
  return currentPlayer(state).id === actorId;
}

export function applyAction(state: CodaState, actorId: string, action: CodaAction): CodaState {
  if (!state.players.some((p) => p.id === actorId)) return state;
  switch (action.type) {
    case "draw":
      return isActorTurn(state, actorId) ? drawCard(state, action.color) : state;
    case "select":
      return isActorTurn(state, actorId) ? selectTile(state, action.playerId, action.index) : state;
    case "guess":
      return isActorTurn(state, actorId) ? guessTile(state, action.value) : state;
    case "continue":
      return isActorTurn(state, actorId) ? continueGuess(state) : state;
    case "stay":
      return isActorTurn(state, actorId) ? stay(state) : state;
    case "slot":
      return setPendingSlot(state, action.index, actorId);
    case "rps":
      return playRps(state, action.throw, actorId);
    default:
      return state;
  }
}

function maskTile(tile: CodaTile): CodaTile {
  if (tile.revealed) return tile;
  return { ...tile, value: 0 };
}

export function viewFor(state: CodaState, viewerId: string): CodaState {
  const me = currentPlayer(state);
  const showDrawn = Boolean(state.drawn && (me.id === viewerId || state.drawn.revealed));
  const showPending = Boolean(state.pending && (me.id === viewerId || state.pending.revealed));
  return {
    ...state,
    deck: state.deck.map((_, i) => ({
      id: `hidden-deck-${i}`,
      color: "black" as const,
      value: 0,
      revealed: false,
    })),
    leftByColor: {
      black: state.deck.filter((t) => t.color === "black").length,
      white: state.deck.filter((t) => t.color === "white").length,
    },
    rpsThrows: state.rpsReveal
      ? { [state.rpsReveal.aId]: state.rpsReveal.a, [state.rpsReveal.bId]: state.rpsReveal.b }
      : state.rpsThrows[viewerId]
        ? { [viewerId]: state.rpsThrows[viewerId] }
        : {},
    rpsReveal: state.rpsReveal,
    stashSlots:
      state.stashSlots[viewerId] !== undefined ? { [viewerId]: state.stashSlots[viewerId] } : {},
    pendingSlot: me.id === viewerId ? state.pendingSlot : null,
    humanDraft: me.id === viewerId ? state.humanDraft : null,
    players: state.players.map((p) => ({
      ...p,
      tiles: p.id === viewerId ? p.tiles : p.tiles.map(maskTile),
      stash: p.stash ? (p.id === viewerId ? p.stash : maskTile(p.stash)) : null,
    })),
    drawn: state.drawn ? (showDrawn ? state.drawn : maskTile(state.drawn)) : null,
    pending: state.pending ? (showPending ? state.pending : maskTile(state.pending)) : null,
  };
}
