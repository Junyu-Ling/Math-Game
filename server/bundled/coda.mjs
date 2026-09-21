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
var OPENING = 4;
function makeNumberDeck() {
  const tiles = [];
  for (const color of ["black", "white"]) {
    for (let n = 0; n <= 11; n++) {
      tiles.push({ id: uid("t"), color, value: n, revealed: false });
    }
  }
  return shuffle(tiles);
}
function makeJokers() {
  return shuffle(
    ["black", "white"].map((color) => ({
      id: uid("t"),
      color,
      value: "joker",
      revealed: false
    }))
  );
}
function takeByColor(deck, color, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const idx = deck.findIndex((t) => t.color === color && t.value !== "joker");
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
    stashSlots: {}
  };
}
function needsArrangeWait(inserter, pending) {
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
    ...emptyArrange()
  };
  next = checkEliminations(next);
  if (next.phase === "over") return next;
  if (resume === "next") return nextTurn(next);
  return { ...next, phase: "draw" };
}
function openingSplit(black, white) {
  const b = Math.max(0, Math.min(OPENING, Math.floor(black)));
  const w = b + Math.max(0, Math.floor(white)) === OPENING ? Math.max(0, Math.floor(white)) : OPENING - b;
  return { black: b, white: w };
}
function pullOpeningJoker(player) {
  const joker = player.tiles.find((t) => t.value === "joker");
  const nums = sortOpening(player.tiles.filter((t) => t.value !== "joker"));
  return { ...player, tiles: nums, stash: joker ?? null };
}
function scatterOpeningJokers(you, rival, deck) {
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
function startCodaMatch(useJokers, a, b) {
  const base = startCoda(useJokers, a.black, a.white);
  const deck = makeNumberDeck();
  const aSplit = openingSplit(a.black, a.white);
  const bSplit = openingSplit(b.black, b.white);
  const deal = (seat, n) => ({
    id: seat.id,
    name: seat.name,
    human: true,
    tiles: sortOpening([...takeByColor(deck, "black", n.black), ...takeByColor(deck, "white", n.white)]),
    stash: null,
    out: false
  });
  let you = deal(a, aSplit);
  let rival = deal(b, bSplit);
  if (useJokers) scatterOpeningJokers(you, rival, deck);
  you = pullOpeningJoker(you);
  rival = pullOpeningJoker(rival);
  const wait = Boolean(you.stash || rival.stash);
  const stashSlots = {};
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
    pendingSlot: wait && you.stash ? insertIndices(you.tiles, you.stash)[0] ?? 0 : null,
    humanDraft: wait ? you.tiles.map((t) => ({ ...t })) : null,
    frozenRival: wait ? rival.tiles.map((t) => ({ ...t })) : null,
    resume: wait ? "draw" : null,
    rpsThrows: {},
    stashSlots,
    log: [
      {
        id: uid("l"),
        text: wait ? "\u8054\u673A\u5F00\u5C40\uFF1A\u6709\u4EBA\u6478\u5230 \u2014 \u5219\u6574\u7406 5 \u79D2\u3002" : "\u8054\u673A\u5F00\u5C40 4 \u5F20\u5DF2\u5728\u624B\u91CC\u3002\u731C\u62F3\u5B9A\u5148\u624B\u3002"
      }
    ]
  };
}
function startCoda(useJokers = true, youBlack = 2, youWhite = 2) {
  const deck = makeNumberDeck();
  const youSplit = openingSplit(youBlack, youWhite);
  const rivalSplit = openingSplit(2, 2);
  const deal = (name, human, b, w) => {
    const tiles = sortOpening([...takeByColor(deck, "black", b), ...takeByColor(deck, "white", w)]);
    return { id: uid("p"), name, human, tiles, stash: null, out: false };
  };
  let you = deal("YOU", true, youSplit.black, youSplit.white);
  let rival = deal("RIVAL", false, rivalSplit.black, rivalSplit.white);
  if (useJokers) scatterOpeningJokers(you, rival, deck);
  you = pullOpeningJoker(you);
  rival = pullOpeningJoker(rival);
  const wait = Boolean(you.stash || rival.stash);
  const stashSlots = {};
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
    pendingSlot: wait && you.stash ? insertIndices(you.tiles, you.stash)[0] ?? 0 : null,
    humanDraft: wait ? you.tiles.map((t) => ({ ...t })) : null,
    frozenRival: wait ? rival.tiles.map((t) => ({ ...t })) : null,
    resume: wait ? "draw" : null,
    rpsThrows: {},
    stashSlots,
    log: [
      {
        id: uid("l"),
        text: you.stash ? "\u5F00\u5C40\u6478\u5230 \u2014\uFF0C\u63D2\u5165\u540E\u4ECD\u662F 4 \u5F20\u5E76\u9501\u5B9A\u3002" : wait ? "\u5F00\u5C40 4 \u5F20\u5DF2\u5728\u624B\u91CC\u3002\u5BF9\u624B\u6478\u5230 \u2014\uFF0C\u6574\u7406\u540E\u731C\u62F3\u3002" : "\u5F00\u5C40 4 \u5F20\u5DF2\u5728\u624B\u91CC\uFF0C\u6CA1\u6709 \u2014\u3002\u731C\u62F3\u5B9A\u5148\u624B\u3002"
      }
    ]
  };
}
function enterArrange(state, pending, resume) {
  const inserter = currentPlayer(state);
  if (!needsArrangeWait(inserter, pending)) {
    return instantInsert(
      {
        ...state,
        log: [...state.log, { id: uid("l"), text: "\u4F4D\u7F6E\u552F\u4E00\uFF0C\u6570\u5B57\u81EA\u52A8\u5165\u5217\u3002" }]
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
        text: resume === "draw" ? "\u5F00\u5C40\u6574\u7406 5 \u79D2\uFF1A\u6760\u5728\u5916\u9762\uFF0C\u63D2\u5165\u540E\u9501\u5B9A\u3002" : "\u6574\u7406 5 \u79D2\uFF1A\u65B0\u724C\u505C\u5728\u5916\u9762\uFF0C\u9009\u597D\u4F4D\u7F6E\u4E5F\u8981\u7B49\u5230\u65F6\u95F4\u7ED3\u675F\u3002"
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
      log: [...state.log, { id: uid("l"), text: `${remaining[0].name} \u7559\u4E0B\u672A\u7FFB\u5F00\u7684\u5BC6\u7801\uFF0C\u80DC\u51FA\u3002`, tone: "you" }]
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
      return { ...state, turn: i, phase: "draw", drawn: null, selected: null };
    }
  }
  return state;
}
function currentPlayer(state) {
  return state.players[state.turn] ?? state.players[0];
}
function drawCard(state) {
  if (state.phase !== "draw") return state;
  if (state.deck.length === 0) {
    return { ...state, phase: "guess", drawn: null, log: [...state.log, { id: uid("l"), text: "\u724C\u5806\u5DF2\u7A7A\uFF0C\u76F4\u63A5\u731C\u724C\u3002" }] };
  }
  const [card, ...rest] = state.deck;
  if (!card) return state;
  const who = currentPlayer(state).name;
  return {
    ...state,
    deck: rest,
    drawn: { ...card, revealed: false },
    phase: "guess",
    log: [...state.log, { id: uid("l"), text: `${who} \u6478\u4E86\u4E00\u5F20\u724C\u3002`, tone: currentPlayer(state).human ? "you" : "ai" }]
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
  const me = currentPlayer(state);
  const label = guess === "joker" ? "Joker" : `${tile.color === "black" ? "\u9ED1" : "\u767D"} ${guess}`;
  const hit = tileMatches(tile, guess);
  if (hit) {
    const players = state.players.map(
      (p) => p.id !== target.id ? p : {
        ...p,
        tiles: p.tiles.map((t, i) => i === state.selected?.index ? { ...t, revealed: true } : t)
      }
    );
    let next2 = {
      ...state,
      players,
      selected: null,
      phase: "continue",
      log: [
        ...state.log,
        { id: uid("l"), text: `${me.name} \u731C\u4E2D ${target.name} \u7684 ${label}\u3002`, tone: me.human ? "you" : "ai" }
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
        selected: null,
        log: [
          ...state.log,
          { id: uid("l"), text: `${me.name} \u731C\u9519\uFF08${label}\uFF09\u3002\u516C\u5F00\u624B\u724C\uFF0C\u8FDB\u5165\u6574\u7406\u3002`, tone: "bad" }
        ]
      },
      revealedDrawn,
      "next"
    );
  }
  let next = {
    ...state,
    drawn: null,
    selected: null,
    log: [...state.log, { id: uid("l"), text: `${me.name} \u731C\u9519\uFF08${label}\uFF09\u3002`, tone: "bad" }]
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
      log: [...state.log, { id: uid("l"), text: `${me.name} \u505C\u724C\uFF0C\u8FDB\u5165\u6574\u7406\u3002` }]
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
  if (!player.stash) return player;
  const slot = pickSlot(player.tiles, player.stash, preferred, !player.human);
  return { ...insertInto(player, player.stash, slot), stash: null };
}
function finishArrange(state) {
  if (state.phase !== "arrange") return state;
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
    ...emptyArrange()
  };
  next = checkEliminations(next);
  if (next.phase === "over") return next;
  if (state.resume === "next") return nextTurn(next);
  return {
    ...next,
    phase: "rps",
    log: [...next.log, { id: uid("l"), text: "\u6574\u7406\u7ED3\u675F\uFF0C\u6760\u5DF2\u9501\u5B9A\u3002\u77F3\u5934\u526A\u5200\u5E03\uFF0C\u8F93\u7684\u4EBA\u5148\u6478\u3002" }]
  };
}
var RPS_LABEL = { rock: "\u77F3\u5934", paper: "\u5E03", scissors: "\u526A\u5200" };
function rpsWins(a, b) {
  return a === "rock" && b === "scissors" || a === "paper" && b === "rock" || a === "scissors" && b === "paper";
}
function resolveRps(state, aId, a, bId, b) {
  if (a === b) {
    return {
      ...state,
      rpsThrows: {},
      log: [...state.log, { id: uid("l"), text: `\u5E73\u5C40\uFF0C\u90FD\u662F${RPS_LABEL[a]}\u3002\u518D\u6765\u4E00\u6B21\u3002` }]
    };
  }
  const aWins = rpsWins(a, b);
  const loserId = aWins ? bId : aId;
  const loserTurn = state.players.findIndex((p) => p.id === loserId);
  return {
    ...state,
    turn: loserTurn >= 0 ? loserTurn : 0,
    phase: "draw",
    drawn: null,
    selected: null,
    rpsThrows: {},
    log: [
      ...state.log,
      {
        id: uid("l"),
        text: `${state.players.find((p) => p.id === aId)?.name} \u51FA${RPS_LABEL[a]}\uFF0C${state.players.find((p) => p.id === bId)?.name} \u51FA${RPS_LABEL[b]}\u3002\u8F93\u7684\u4EBA\u5148\u6478\u3002`
      }
    ]
  };
}
function playRps(state, you, actorId) {
  if (state.phase !== "rps") return state;
  const me = actorId ? state.players.find((p) => p.id === actorId) : state.players.find((p) => p.human);
  const foe = state.players.find((p) => p.id !== me?.id);
  if (!me || !foe) return state;
  if (!foe.human) {
    const ai = ["rock", "paper", "scissors"][Math.floor(Math.random() * 3)];
    return resolveRps(state, me.id, you, foe.id, ai);
  }
  const mine = you;
  const theirs = state.rpsThrows[foe.id];
  if (!theirs) {
    return {
      ...state,
      rpsThrows: { ...state.rpsThrows, [me.id]: mine },
      log: [...state.log, { id: uid("l"), text: `${me.name} \u5DF2\u51FA\u62F3\uFF0C\u7B49\u5F85\u5BF9\u624B\u3002` }]
    };
  }
  return resolveRps({ ...state, rpsThrows: { ...state.rpsThrows, [me.id]: mine } }, me.id, mine, foe.id, theirs);
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
function aiGuess(state) {
  const me = currentPlayer(state);
  const targets = state.players.filter((p) => p.id !== me.id && !p.out);
  let best = null;
  for (const p of targets) {
    for (let index = 0; index < p.tiles.length; index++) {
      const tile = p.tiles[index];
      if (!tile || tile.revealed) continue;
      const opts = possibleValues(p, index).filter((v) => v === "joker" || typeof v === "number");
      const nums = opts.filter((v) => v !== "joker");
      const pick = nums.length ? nums[Math.floor(nums.length / 2)] : "joker";
      const score = 100 - opts.length;
      if (!best || score > best.score) best = { playerId: p.id, index, value: pick, score };
    }
  }
  if (!best) return null;
  return { playerId: best.playerId, index: best.index, value: best.value };
}
function formatTile(tile, hidden) {
  if (hidden && !tile.revealed) return tile.color === "black" ? "\u9ED1" : "\u767D";
  if (tile.value === "joker") return tile.color === "black" ? "\u9ED1 \u2014" : "\u767D \u2014";
  return `${tile.color === "black" ? "\u9ED1" : "\u767D"} ${tile.value}`;
}
function isActorTurn(state, actorId) {
  return currentPlayer(state).id === actorId;
}
function applyAction(state, actorId, action) {
  if (!state.players.some((p) => p.id === actorId)) return state;
  switch (action.type) {
    case "draw":
      return isActorTurn(state, actorId) ? drawCard(state) : state;
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
    rpsThrows: {},
    stashSlots: state.stashSlots[viewerId] !== void 0 ? { [viewerId]: state.stashSlots[viewerId] } : {},
    pendingSlot: me.id === viewerId ? state.pendingSlot : null,
    humanDraft: me.id === viewerId ? state.humanDraft : null,
    players: state.players.map((p) => ({
      ...p,
      tiles: p.id === viewerId ? p.tiles : p.tiles.map(maskTile),
      stash: p.stash ? p.id === viewerId ? p.stash : maskTile(p.stash) : null
    })),
    drawn: state.drawn ? showDrawn ? state.drawn : maskTile(state.drawn) : null,
    pending: state.pending ? showPending ? state.pending : maskTile(state.pending) : null
  };
}
export {
  ARRANGE_MS,
  OPENING,
  aiGuess,
  applyAction,
  continueGuess,
  currentPlayer,
  drawCard,
  finishArrange,
  formatTile,
  guessTile,
  insertIndices,
  isSorted,
  placeDrawn,
  playRps,
  possibleValues,
  rank,
  selectTile,
  setPendingSlot,
  startCoda,
  startCodaMatch,
  stay,
  viewFor
};
