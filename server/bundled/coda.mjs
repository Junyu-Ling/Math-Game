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

// src/games/davinci/engine.ts
var ARRANGE_MS = 5e3;
var RPS_REVEAL_MS = 3400;
var OPENING = 4;
function makeDeck(useJokers) {
  const tiles = [];
  for (const color of ["black", "white"]) {
    for (let n = 0; n <= 11; n++) {
      tiles.push({ id: uid("t"), color, value: n, revealed: false });
    }
    if (useJokers) {
      tiles.push({ id: uid("t"), color, value: "joker", revealed: false });
    }
  }
  return shuffle(tiles);
}
function takeByColor(deck, color, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const idx = deck.findIndex((t) => t.color === color);
    if (idx < 0) break;
    out.push(deck.splice(idx, 1)[0]);
  }
  return out;
}
function pickSlot(tiles, card, preferred, random) {
  const opts = insertIndices(tiles, card);
  if (preferred !== null && opts.includes(preferred)) return preferred;
  if (random && opts.length > 1) return opts[Math.floor(Math.random() * opts.length)];
  return opts[0] ?? tiles.length;
}
function rank(tile) {
  if (tile.value === "joker") return -1;
  return tile.value * 2 + (tile.color === "white" ? 1 : 0);
}
function isSorted(tiles) {
  const nums = tiles.filter((t) => t.value !== "joker");
  for (let i = 1; i < nums.length; i++) {
    const a = nums[i - 1];
    const b = nums[i];
    if (!a || !b) continue;
    if (rank(a) > rank(b)) return false;
  }
  return true;
}
function insertIndices(tiles, card) {
  if (card.value === "joker") {
    return Array.from({ length: tiles.length + 1 }, (_, i) => i);
  }
  const found = [];
  for (let i = 0; i <= tiles.length; i++) {
    const trial = [...tiles];
    trial.splice(i, 0, card);
    if (isSorted(trial)) found.push(i);
  }
  return found.length ? found : [tiles.length];
}
function sortOpening(tiles) {
  const jokers = tiles.filter((t) => t.value === "joker");
  const nums = tiles.filter((t) => t.value !== "joker").sort((a, b) => rank(a) - rank(b));
  return [...jokers, ...nums];
}
function emptyArrange() {
  return {
    pending: null,
    pendingSlot: null,
    humanDraft: null,
    frozenRival: null,
    resume: null,
    rpsThrows: {},
    rpsReveal: null,
    stashSlots: {}
  };
}
function markFresh(fresh, tileId, ownerId) {
  return { ...fresh ?? {}, [tileId]: ownerId };
}
function expireFresh(fresh, ownerId) {
  const next = {};
  for (const [id, owner] of Object.entries(fresh ?? {})) {
    if (owner !== ownerId) next[id] = owner;
  }
  return next;
}
function needsArrangeWait(inserter, pending) {
  if (!inserter.human) return false;
  return Boolean(pending || inserter.stash);
}
function instantInsert(state, pending, resume) {
  const inserter = currentPlayer(state);
  let players = state.players;
  if (pending) {
    const slot = pickSlot(inserter.tiles, pending, null, !inserter.human);
    players = players.map((p) => p.id === inserter.id ? insertInto(p, pending, slot) : p);
  }
  let next = {
    ...state,
    players,
    drawn: null,
    selected: null,
    fresh: pending && resume === "next" ? markFresh(state.fresh, pending.id, inserter.id) : state.fresh ?? {},
    ...emptyArrange()
  };
  next = checkEliminations(next);
  if (next.phase === "over") return next;
  if (resume === "next") return nextTurn(next);
  return afterOpening(next);
}
function openingSplit(black, white) {
  const b = Math.max(0, Math.min(OPENING, Math.floor(black)));
  const w = b + Math.max(0, Math.floor(white)) === OPENING ? Math.max(0, Math.floor(white)) : OPENING - b;
  return { black: b, white: w };
}
function pullOpeningJoker(player) {
  const jokers = player.tiles.filter((t) => t.value === "joker");
  const nums = player.tiles.filter((t) => t.value !== "joker").sort((a, b) => rank(a) - rank(b));
  const [stash, ...queue] = jokers;
  return { ...player, tiles: nums, stash: stash ?? null, queue };
}
function emptyCodaPlayer(p) {
  return {
    id: p.id,
    name: p.name,
    human: p.human !== false,
    tiles: [],
    stash: null,
    queue: [],
    out: false,
    black: 2,
    white: 2,
    ready: false
  };
}
function afterOpening(state) {
  if (state.players.length !== 2) {
    const living = state.players.filter((p) => !p.out);
    const pick = living[Math.floor(Math.random() * Math.max(1, living.length))] ?? state.players[0];
    const turn = Math.max(0, state.players.findIndex((p) => p.id === pick?.id));
    return {
      ...state,
      turn,
      phase: "draw",
      drawn: null,
      selected: null,
      log: [...state.log, { id: uid("l"), text: `${state.players[turn]?.name} draws first.` }]
    };
  }
  return {
    ...state,
    phase: "rps",
    log: [...state.log, { id: uid("l"), text: "Tiles locked. RPS \u2014 loser guesses first." }]
  };
}
function startCodaLobby(people, useJokers) {
  const players = people.slice(0, 4).map(emptyCodaPlayer);
  return {
    players,
    deck: [],
    turn: 0,
    phase: "lobby",
    drawn: null,
    selected: null,
    useJokers,
    winnerId: null,
    arrangeId: 0,
    pending: null,
    pendingSlot: null,
    humanDraft: null,
    frozenRival: null,
    resume: null,
    rpsThrows: {},
    rpsReveal: null,
    stashSlots: {},
    tried: {},
    fresh: {},
    log: [
      {
        id: uid("l"),
        text: `Table ${players.length}/4. Each player picks black and white (4 total), then ready.`
      }
    ]
  };
}
function pickCodaMix(state, actorId, black, white) {
  if (state.phase !== "lobby") return state;
  if (!state.players.some((p) => p.id === actorId)) return state;
  const split = openingSplit(black, white);
  return {
    ...state,
    players: state.players.map(
      (p) => p.id === actorId ? { ...p, black: split.black, white: split.white, ready: false } : p
    )
  };
}
function readyCoda(state, actorId) {
  if (state.phase !== "lobby") return state;
  const actor = state.players.find((p) => p.id === actorId);
  if (!actor) return state;
  const next = {
    ...state,
    players: state.players.map((p) => p.id === actorId ? { ...p, ready: true } : p),
    log: [...state.log, { id: uid("l"), text: `${actor.name} is ready.` }]
  };
  if (next.players.length >= 2 && next.players.every((p) => p.ready)) return dealCodaTable(next);
  return next;
}
function dealCodaTable(state) {
  const seated = state.players.slice(0, 4);
  if (seated.length < 2) return state;
  const deck = makeDeck(state.useJokers);
  const players = seated.map((p) => {
    const split = openingSplit(p.black ?? 2, p.white ?? 2);
    const dealtTiles = sortOpening([
      ...takeByColor(deck, "black", split.black),
      ...takeByColor(deck, "white", split.white)
    ]);
    return pullOpeningJoker({
      ...p,
      tiles: dealtTiles,
      stash: null,
      out: false
    });
  });
  const wait = players.some((p) => p.stash);
  const stashSlots = {};
  for (const p of players) {
    if (p.stash) stashSlots[p.id] = insertIndices(p.tiles, p.stash)[0] ?? 0;
  }
  const firstStash = players.find((p) => p.stash);
  const other = players.find((p) => p.id !== firstStash?.id) ?? players[1];
  const dealt = {
    ...state,
    players,
    deck: shuffle(deck),
    turn: 0,
    selected: null,
    winnerId: null,
    tried: {},
    fresh: {},
    rpsThrows: {},
    rpsReveal: null,
    stashSlots,
    arrangeId: wait ? state.arrangeId + 1 : 0,
    pending: wait ? firstStash?.stash ?? null : null,
    pendingSlot: wait && firstStash?.stash ? stashSlots[firstStash.id] ?? 0 : null,
    humanDraft: wait && firstStash ? firstStash.tiles.map((t) => ({ ...t })) : null,
    frozenRival: wait && other ? other.tiles.map((t) => ({ ...t })) : null,
    resume: wait ? "draw" : null,
    drawn: wait ? firstStash?.stash ?? null : null,
    log: [
      ...state.log,
      {
        id: uid("l"),
        text: wait ? "Opening: if anyone drew a dash, arrange for 5 seconds." : players.length === 2 ? "Opening 4 in hand. RPS \u2014 loser guesses first." : "Opening 4 in hand. First draw is random."
      }
    ]
  };
  if (wait) return { ...dealt, phase: "arrange" };
  return afterOpening({ ...dealt, phase: "draw" });
}
function startCodaMatch(useJokers, a, b) {
  let lobby = startCodaLobby([a, b], useJokers);
  lobby = pickCodaMix(lobby, a.id, a.black, a.white);
  lobby = pickCodaMix(lobby, b.id, b.black, b.white);
  lobby = {
    ...lobby,
    players: lobby.players.map((p) => ({ ...p, ready: true, human: p.id === a.id ? a.human !== false : b.human !== false }))
  };
  return dealCodaTable(lobby);
}
var CPU_NAMES = ["CPU", "CPU 2", "CPU 3"];
function startCoda(useJokers = true, youBlack = 2, youWhite = 2, seats = 2) {
  const n = Math.max(2, Math.min(4, Math.floor(seats) || 2));
  const people = Array.from({ length: n }, (_, i) => ({
    id: i === 0 ? "you" : `cpu-${i}`,
    name: i === 0 ? "YOU" : CPU_NAMES[i - 1],
    human: i === 0
  }));
  let lobby = startCodaLobby(people, useJokers);
  lobby = pickCodaMix(lobby, "you", youBlack, youWhite);
  for (const p of lobby.players) {
    if (p.id !== "you") lobby = pickCodaMix(lobby, p.id, 2, 2);
  }
  lobby = { ...lobby, players: lobby.players.map((p) => ({ ...p, ready: true })) };
  return dealCodaTable(lobby);
}
function enterArrange(state, pending, resume) {
  const inserter = currentPlayer(state);
  if (!needsArrangeWait(inserter, pending)) {
    return instantInsert(
      {
        ...state,
        log: [...state.log, { id: uid("l"), text: "Only one legal slot. Number inserts automatically." }]
      },
      pending,
      resume
    );
  }
  const other = state.players.find((p) => p.id !== inserter.id) ?? state.players[1];
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
        text: resume === "draw" ? "Opening arrange 5s: the tile stays out, then locks after insert." : "Arrange 5s: the new tile stays out. Wait out the timer even after you pick a slot."
      }
    ]
  };
}
function alive(state) {
  return state.players.filter((p) => !p.out);
}
function checkEliminations(state) {
  const players = state.players.map((p) => ({
    ...p,
    out: p.tiles.length > 0 && p.tiles.every((t) => t.revealed)
  }));
  const remaining = players.filter((p) => !p.out);
  if (remaining.length === 1 && remaining[0]) {
    return {
      ...state,
      players,
      phase: "over",
      winnerId: remaining[0].id,
      log: [...state.log, { id: uid("l"), text: `${remaining[0].name} still has a hidden code and wins.`, tone: "you" }]
    };
  }
  return { ...state, players };
}
function nextTurn(state) {
  const living = alive(state);
  if (living.length <= 1) return checkEliminations(state);
  let i = state.turn;
  for (let n = 0; n < state.players.length; n++) {
    i = (i + 1) % state.players.length;
    const p = state.players[i];
    if (p && !p.out) {
      return {
        ...state,
        turn: i,
        phase: "draw",
        drawn: null,
        selected: null,
        fresh: expireFresh(state.fresh, p.id)
      };
    }
  }
  return state;
}
function currentPlayer(state) {
  return state.players[state.turn] ?? state.players[0];
}
function deckCounts(state) {
  if (state.leftByColor) return state.leftByColor;
  return {
    black: state.deck.filter((t) => t.color === "black").length,
    white: state.deck.filter((t) => t.color === "white").length
  };
}
function aiDrawColor(state) {
  const { black, white } = deckCounts(state);
  if (black <= 0 && white <= 0) return "black";
  if (black <= 0) return "white";
  if (white <= 0) return "black";
  return Math.random() < 0.5 ? "black" : "white";
}
function drawCard(state, color) {
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
    log: [...state.log, { id: uid("l"), text: `${who} draws a ${colorName} tile.`, tone: currentPlayer(state).human ? "you" : "ai" }]
  };
}
function selectTile(state, playerId, index) {
  if (state.phase !== "guess") return state;
  const me = currentPlayer(state);
  if (playerId === me.id) return state;
  const target = state.players.find((p) => p.id === playerId);
  const tile = target?.tiles[index];
  if (!tile || tile.revealed) return state;
  return { ...state, selected: { playerId, index } };
}
function tileMatches(tile, guess) {
  return tile.value === guess;
}
function triedOnTile(state, playerId, index) {
  const tile = state.players.find((p) => p.id === playerId)?.tiles[index];
  if (!tile) return [];
  return (state.tried ?? {})[tile.id] ?? [];
}
function rememberGuess(state, tileId, guess) {
  const prev = (state.tried ?? {})[tileId] ?? [];
  if (prev.some((v) => v === guess)) return state.tried;
  return { ...state.tried ?? {}, [tileId]: [...prev, guess] };
}
function insertInto(player, card, index) {
  const idx = index ?? insertIndices(player.tiles, card)[0] ?? player.tiles.length;
  const tiles = [...player.tiles];
  tiles.splice(idx, 0, card);
  return { ...player, tiles };
}
function guessTile(state, guess) {
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
    const players = state.players.map(
      (p) => p.id !== target.id ? p : {
        ...p,
        tiles: p.tiles.map((t, i) => i === state.selected?.index ? { ...t, revealed: true } : t)
      }
    );
    let next2 = {
      ...state,
      tried,
      players,
      selected: null,
      phase: "continue",
      log: [
        ...state.log,
        { id: uid("l"), text: `${me.name} guessed ${target.name}'s ${label}.`, tone: me.human ? "you" : "ai" }
      ]
    };
    next2 = checkEliminations(next2);
    if (next2.phase === "over") return next2;
    const stillHidden = next2.players.some((p) => p.id !== me.id && !p.out && p.tiles.some((t) => !t.revealed));
    if (!stillHidden) return stay(next2);
    return next2;
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
          { id: uid("l"), text: `${me.name} missed (${label}). Drawn tile is shown. Arrange.`, tone: "bad" }
        ]
      },
      revealedDrawn,
      "next"
    );
  }
  let next = {
    ...state,
    tried,
    drawn: null,
    selected: null,
    log: [...state.log, { id: uid("l"), text: `${me.name} missed (${label}).`, tone: "bad" }]
  };
  next = checkEliminations(next);
  if (next.phase === "over") return next;
  return nextTurn(next);
}
function continueGuess(state) {
  if (state.phase !== "continue") return state;
  return { ...state, phase: "guess", selected: null };
}
function stay(state) {
  if (state.phase !== "continue" && state.phase !== "guess") return state;
  const me = currentPlayer(state);
  if (!state.drawn) return nextTurn({ ...state, phase: "draw" });
  const hidden = { ...state.drawn, revealed: false };
  return enterArrange(
    {
      ...state,
      selected: null,
      log: [...state.log, { id: uid("l"), text: `${me.name} stays. Arrange.` }]
    },
    hidden,
    "next"
  );
}
function setPendingSlot(state, index, actorId) {
  if (state.phase !== "arrange") return state;
  const actor = actorId ? state.players.find((p) => p.id === actorId) : currentPlayer(state);
  if (!actor) return state;
  if (actor.stash && state.resume === "draw") {
    const allowed2 = insertIndices(actor.tiles, actor.stash);
    if (!allowed2.includes(index)) return state;
    const queue = actor.queue ?? [];
    if (queue.length) {
      const placed = {
        ...insertInto(actor, actor.stash, index),
        stash: queue[0] ?? null,
        queue: queue.slice(1)
      };
      return {
        ...state,
        players: state.players.map((p) => p.id === actor.id ? placed : p),
        stashSlots: { ...state.stashSlots, [actor.id]: index }
      };
    }
    const next = {
      ...state,
      stashSlots: { ...state.stashSlots, [actor.id]: index }
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
function settleStash(player, preferred) {
  if (!player.stash) return { ...player, queue: player.queue ?? [] };
  const slot = pickSlot(player.tiles, player.stash, preferred, !player.human);
  return { ...insertInto(player, player.stash, slot), stash: null, queue: player.queue ?? [] };
}
function placeOpeningDashes(player, preferred) {
  const held = [...player.stash ? [player.stash] : [], ...player.queue ?? []];
  if (!held.length) return { ...player, stash: null, queue: [] };
  let tiles = player.tiles;
  let hint = preferred;
  for (const card of held) {
    const slot = pickSlot(tiles, card, hint, !player.human);
    tiles = [...tiles.slice(0, slot), card, ...tiles.slice(slot)];
    hint = player.human ? slot + 1 : null;
  }
  return { ...player, tiles, stash: null, queue: [] };
}
function finishArrange(state) {
  if (state.phase !== "arrange") return state;
  if (state.resume === "draw") {
    const players2 = state.players.map((p) => placeOpeningDashes(p, state.stashSlots[p.id] ?? null));
    let next2 = {
      ...state,
      players: players2,
      drawn: null,
      fresh: state.fresh ?? {},
      ...emptyArrange()
    };
    next2 = checkEliminations(next2);
    if (next2.phase === "over") return next2;
    return afterOpening(next2);
  }
  const inserterId = (state.players[state.turn] ?? state.players[0])?.id;
  let players = state.players.map(
    (p) => p.id === inserterId && state.humanDraft ? { ...p, tiles: state.humanDraft, stash: p.stash } : p
  );
  if (state.pending) {
    const inserter = players[state.turn] ?? players[0];
    const preferred = state.stashSlots[inserter.id] ?? state.pendingSlot;
    const slot = pickSlot(inserter.tiles, state.pending, preferred, !inserter.human);
    players = players.map((p) => {
      if (p.id !== inserter.id) return p;
      const next2 = insertInto(p, state.pending, slot);
      const stash = p.stash && p.stash.id === state.pending?.id ? null : p.stash;
      return { ...next2, stash };
    });
  }
  players = players.map(
    (p) => settleStash(p, state.stashSlots[p.id] ?? (p.id === players[state.turn]?.id ? state.pendingSlot : null))
  );
  let next = {
    ...state,
    players,
    drawn: null,
    fresh: state.pending && state.resume === "next" && inserterId ? markFresh(state.fresh, state.pending.id, inserterId) : state.fresh ?? {},
    ...emptyArrange()
  };
  next = checkEliminations(next);
  if (next.phase === "over") return next;
  if (state.resume === "next") return nextTurn(next);
  return afterOpening(next);
}
var RPS_LABEL = { rock: "rock", paper: "paper", scissors: "scissors" };
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
function finishRps(state) {
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
        text: `${state.players.find((p) => p.id === aId)?.name} ${RPS_LABEL[a]} vs ${state.players.find((p) => p.id === bId)?.name} ${RPS_LABEL[b]}. Loser guesses first.`
      }
    ]
  };
}
function playRps(state, you, actorId) {
  if (state.phase !== "rps" || state.rpsReveal) return state;
  const me = actorId ? state.players.find((p) => p.id === actorId) : state.players.find((p) => p.human);
  const foe = state.players.find((p) => p.id !== me?.id && p.human) ?? state.players.find((p) => p.id !== me?.id);
  if (!me || !foe) return state;
  if (state.rpsThrows[me.id]) return state;
  if (!foe.human) {
    const ai = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];
    return beginRpsReveal(state, me.id, you, foe.id, ai);
  }
  const theirs = state.rpsThrows[foe.id];
  if (!theirs) {
    return {
      ...state,
      rpsThrows: { ...state.rpsThrows, [me.id]: you },
      log: [...state.log, { id: uid("l"), text: `${me.name} is ready. Waiting for the other hand.` }]
    };
  }
  return beginRpsReveal({ ...state, rpsThrows: { ...state.rpsThrows, [me.id]: you } }, me.id, you, foe.id, theirs);
}
function placeDrawn(state, index) {
  return setPendingSlot(state, index);
}
function possibleValues(player, index) {
  const tile = player.tiles[index];
  if (!tile) return [];
  const left = player.tiles.slice(0, index).filter((t) => t.value !== "joker");
  const right = player.tiles.slice(index + 1).filter((t) => t.value !== "joker");
  const min = left.length ? rank(left[left.length - 1]) + 1 : 0;
  const max = right.length ? rank(right[0]) - 1 : 23;
  const all = [];
  for (let n = 0; n <= 11; n++) {
    const r = n * 2 + (tile.color === "white" ? 1 : 0);
    if (r >= min && r <= max) all.push(n);
  }
  all.push("joker");
  return all;
}
function knownNumberRank(tile, known) {
  if (!known || tile.value === "joker") return null;
  return rank(tile);
}
function boundLeft(tiles, index, ownerKnown) {
  for (let i = index - 1; i >= 0; i--) {
    const tile = tiles[i];
    if (!tile) continue;
    const r = knownNumberRank(tile, ownerKnown || tile.revealed);
    if (r !== null) return r + 1;
  }
  return 0;
}
function boundRight(tiles, index, ownerKnown) {
  for (let i = index + 1; i < tiles.length; i++) {
    const tile = tiles[i];
    if (!tile) continue;
    const r = knownNumberRank(tile, ownerKnown || tile.revealed);
    if (r !== null) return r - 1;
  }
  return 23;
}
function tilesAiCanSee(state, viewerId) {
  const out = [];
  for (const p of state.players) {
    for (const tile of p.tiles) {
      if (p.id === viewerId || tile.revealed) out.push(tile);
    }
    if (p.stash && (p.id === viewerId || p.stash.revealed)) out.push(p.stash);
    for (const tile of p.queue ?? []) {
      if (p.id === viewerId || tile.revealed) out.push(tile);
    }
  }
  const actor = currentPlayer(state);
  if (state.drawn && (actor.id === viewerId || state.drawn.revealed)) out.push(state.drawn);
  if (state.pending && (actor.id === viewerId || state.pending.revealed)) out.push(state.pending);
  return out;
}
function aiScan(state) {
  const me = currentPlayer(state);
  const taken = new Set(tilesAiCanSee(state, me.id).map((t) => `${t.color}:${String(t.value)}`));
  let best = null;
  for (const p of state.players) {
    if (p.id === me.id || p.out) continue;
    const owns = p.id === me.id;
    for (let index = 0; index < p.tiles.length; index++) {
      const tile = p.tiles[index];
      if (!tile || tile.revealed) continue;
      const tried = new Set((state.tried?.[tile.id] ?? []).map((v) => String(v)));
      const min = boundLeft(p.tiles, index, owns);
      const max = boundRight(p.tiles, index, owns);
      const nums = [];
      for (let n = 0; n <= 11; n++) {
        const r = n * 2 + (tile.color === "white" ? 1 : 0);
        if (r < min || r > max) continue;
        if (taken.has(`${tile.color}:${n}`)) continue;
        if (tried.has(String(n))) continue;
        nums.push(n);
      }
      const jokerOk = state.useJokers && !taken.has(`${tile.color}:joker`) && !tried.has("joker");
      const remaining = nums.length + (jokerOk ? 1 : 0);
      if (!remaining) continue;
      const value = nums.length ? nums[Math.floor((nums.length - 1) / 2)] : "joker";
      const anchored = Boolean(
        index > 0 && p.tiles[index - 1]?.revealed || p.tiles[index + 1]?.revealed
      );
      const better = !best || remaining < best.remaining || remaining === best.remaining && anchored && !best.anchored || remaining === best.remaining && anchored === best.anchored && index < best.index;
      if (better) best = { playerId: p.id, index, value, remaining, anchored };
    }
  }
  return best;
}
function aiGuess(state) {
  const pick = aiScan(state);
  if (!pick) return null;
  return { playerId: pick.playerId, index: pick.index, value: pick.value };
}
function aiShouldContinue(state) {
  const me = currentPlayer(state);
  const hidden = state.players.filter((p) => p.id !== me.id && !p.out).reduce((n, p) => n + p.tiles.filter((t) => !t.revealed).length, 0);
  if (hidden <= 0) return false;
  if (hidden === 1) return true;
  const pick = aiScan(state);
  if (!pick) return false;
  if (pick.remaining <= 2) return true;
  if (pick.remaining <= 3 && hidden <= 4) return true;
  if (hidden <= 2 && pick.remaining <= 5) return true;
  return pick.anchored && pick.remaining <= 4;
}
function formatTile(tile, hidden) {
  if (hidden && !tile.revealed) return tile.color === "black" ? "black" : "white";
  if (tile.value === "joker") return tile.color === "black" ? "black -" : "white -";
  return `${tile.color === "black" ? "black" : "white"} ${tile.value}`;
}
function isActorTurn(state, actorId) {
  return currentPlayer(state).id === actorId;
}
function applyAction(state, actorId, action) {
  if (!state.players.some((p) => p.id === actorId)) return state;
  switch (action.type) {
    case "pick":
      return pickCodaMix(state, actorId, action.black, action.white);
    case "ready":
      return readyCoda(state, actorId);
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
function maskTile(tile) {
  if (tile.revealed) return tile;
  return { ...tile, value: 0 };
}
function viewFor(state, viewerId) {
  const me = currentPlayer(state);
  const showDrawn = Boolean(state.drawn && (me.id === viewerId || state.drawn.revealed));
  const showPending = Boolean(state.pending && (me.id === viewerId || state.pending.revealed));
  return {
    ...state,
    deck: state.deck.map((_, i) => ({
      id: `hidden-deck-${i}`,
      color: "black",
      value: 0,
      revealed: false
    })),
    leftByColor: {
      black: state.deck.filter((t) => t.color === "black").length,
      white: state.deck.filter((t) => t.color === "white").length
    },
    rpsThrows: state.rpsReveal ? { [state.rpsReveal.aId]: state.rpsReveal.a, [state.rpsReveal.bId]: state.rpsReveal.b } : state.rpsThrows[viewerId] ? { [viewerId]: state.rpsThrows[viewerId] } : {},
    rpsReveal: state.rpsReveal,
    stashSlots: state.stashSlots[viewerId] !== void 0 ? { [viewerId]: state.stashSlots[viewerId] } : {},
    pendingSlot: me.id === viewerId ? state.pendingSlot : null,
    humanDraft: me.id === viewerId ? state.humanDraft : null,
    players: state.players.map((p) => ({
      ...p,
      tiles: p.id === viewerId ? p.tiles : p.tiles.map(maskTile),
      stash: p.stash ? p.id === viewerId ? p.stash : maskTile(p.stash) : null,
      queue: (p.queue ?? []).map((t) => p.id === viewerId ? t : maskTile(t))
    })),
    drawn: state.drawn ? showDrawn ? state.drawn : maskTile(state.drawn) : null,
    pending: state.pending ? showPending ? state.pending : maskTile(state.pending) : null,
    fresh: state.fresh ?? {}
  };
}
export {
  ARRANGE_MS,
  OPENING,
  RPS_REVEAL_MS,
  aiDrawColor,
  aiGuess,
  aiShouldContinue,
  applyAction,
  continueGuess,
  currentPlayer,
  dealCodaTable,
  deckCounts,
  drawCard,
  finishArrange,
  finishRps,
  formatTile,
  guessTile,
  insertIndices,
  isSorted,
  pickCodaMix,
  placeDrawn,
  playRps,
  possibleValues,
  rank,
  readyCoda,
  selectTile,
  setPendingSlot,
  startCoda,
  startCodaLobby,
  startCodaMatch,
  stay,
  triedOnTile,
  viewFor
};
