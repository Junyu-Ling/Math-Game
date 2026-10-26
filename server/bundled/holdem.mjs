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
function holdemRank(rank) {
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  if (rank === "BJ" || rank === "RJ") return 0;
  return Number(rank);
}
function makeDeck() {
  const cards = [];
  for (const suit of SUITS) for (const rank of RANKS) cards.push({ id: uid("pk"), suit, rank });
  return shuffle(cards);
}

// src/games/holdem/engine.ts
var SB = 5;
var BB = 10;
function other(i) {
  return i === 0 ? 1 : 0;
}
function idxOf(s, id) {
  const i = s.players.findIndex((p) => p.id === id);
  if (i < 0) throw new Error("Not seated");
  return i;
}
function combos(arr, k) {
  const out = [];
  const rec = (start, cur) => {
    if (cur.length === k) {
      out.push(cur.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      const item = arr[i];
      if (item === void 0) continue;
      cur.push(item);
      rec(i + 1, cur);
      cur.pop();
    }
  };
  rec(0, []);
  return out;
}
function score5(cards) {
  const ranks = cards.map((c) => holdemRank(c.rank)).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const flush = suits.every((s) => s === suits[0]);
  const uniq = [...new Set(ranks)];
  let straight = false;
  let high = ranks[0] ?? 0;
  if (uniq.length === 5) {
    const u0 = uniq[0] ?? 0;
    const u4 = uniq[4] ?? 0;
    if (u0 - u4 === 4) {
      straight = true;
      high = u0;
    } else if (u0 === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) {
      straight = true;
      high = 5;
    }
  }
  const counts = /* @__PURE__ */ new Map();
  for (const r of ranks) counts.set(r, (counts.get(r) || 0) + 1);
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const g0 = groups[0];
  const g1 = groups[1];
  const g2 = groups[2];
  const kick = (n) => n.reduce((acc, v, i) => acc + v * 15 ** (4 - i), 0);
  if (straight && flush) return (ranks.includes(14) && high === 14 ? 9 : 8) * 15 ** 5 + high;
  if (g0 && g0[1] === 4 && g1) return 7 * 15 ** 5 + kick([g0[0], g1[0]]);
  if (g0 && g1 && g0[1] === 3 && g1[1] === 2) return 6 * 15 ** 5 + kick([g0[0], g1[0]]);
  if (flush) return 5 * 15 ** 5 + kick(ranks);
  if (straight) return 4 * 15 ** 5 + high;
  if (g0 && g0[1] === 3) return 3 * 15 ** 5 + kick([g0[0], ...groups.slice(1).map((g) => g[0])]);
  if (g0 && g1 && g0[1] === 2 && g1[1] === 2) {
    const pairA = Math.max(g0[0], g1[0]);
    const pairB = Math.min(g0[0], g1[0]);
    return 2 * 15 ** 5 + kick([pairA, pairB, g2 ? g2[0] : 0]);
  }
  if (g0 && g0[1] === 2) return 1 * 15 ** 5 + kick([g0[0], ...groups.slice(1).map((g) => g[0])]);
  return kick(ranks);
}
function bestHand(hole, board) {
  const all = [...hole, ...board];
  if (all.length < 5) return 0;
  return Math.max(...combos(all, 5).map(score5));
}
function post(s, i, amt) {
  const p = s.players[i];
  const n = Math.min(amt, p.chips);
  p.chips -= n;
  p.bet += n;
  s.pot += n;
  if (p.chips === 0) p.allIn = true;
}
function raiseBounds(s, playerId) {
  const p = s.players[idxOf(s, playerId)];
  const toCall = Math.max(0, s.currentBet - p.bet);
  const max = p.bet + p.chips;
  const minFull = s.currentBet + Math.max(s.lastRaise, s.bb);
  const canRaise = p.chips > toCall;
  const canFullRaise = max >= minFull;
  return { min: canFullRaise ? minFull : max, max, minFull, toCall, canRaise, canFullRaise };
}
function putIn(s, i, add) {
  const p = s.players[i];
  const before = s.currentBet;
  post(s, i, add);
  if (p.bet <= before) return;
  const increment = p.bet - before;
  if (increment >= Math.max(s.lastRaise, BB)) s.lastRaise = increment;
  s.currentBet = p.bet;
  s.toAct = s.players.filter((x) => !x.folded && !x.allIn).length;
}
function dealHand(s) {
  s.deck = makeDeck();
  s.community = [];
  s.pot = 0;
  s.street = "preflop";
  s.winnerId = null;
  s.currentBet = BB;
  s.lastRaise = BB;
  for (const p of s.players) {
    p.bet = 0;
    p.folded = false;
    p.allIn = false;
    p.hole = [s.deck.pop(), s.deck.pop()];
  }
  const sb = s.dealer;
  const bb = other(sb);
  post(s, sb, SB);
  post(s, bb, BB);
  s.turn = sb;
  s.toAct = 2;
  s.message = "Preflop. Small blind acts.";
}
function emptyHoldemSeat(p) {
  return {
    id: p.id,
    name: p.name,
    human: p.human !== false,
    chips: 1e3,
    bet: 0,
    hole: [],
    folded: false,
    allIn: false
  };
}
function startHoldemLobby(people) {
  const players = people.slice(0, 2).map(emptyHoldemSeat);
  return {
    id: uid("he"),
    players,
    dealer: 0,
    deck: [],
    community: [],
    pot: 0,
    street: "lobby",
    turn: 0,
    currentBet: 0,
    lastRaise: 0,
    toAct: 0,
    winnerId: null,
    message: `Table ${players.length}/2. Open a table, add a CPU or invite, then start.`,
    bb: BB
  };
}
function startHoldemDuel(a, b) {
  const s = {
    id: uid("he"),
    players: [emptyHoldemSeat(a), emptyHoldemSeat(b)],
    dealer: 0,
    deck: [],
    community: [],
    pot: 0,
    street: "preflop",
    turn: 0,
    currentBet: 0,
    lastRaise: 0,
    toAct: 0,
    winnerId: null,
    message: "",
    bb: BB
  };
  dealHand(s);
  return s;
}
function startHoldemPractice() {
  return startHoldemDuel({ id: "you", name: "YOU" }, { id: "cpu", name: "CPU", human: false });
}
function nextStreet(s) {
  for (const p of s.players) p.bet = 0;
  s.currentBet = 0;
  s.lastRaise = BB;
  s.turn = other(s.dealer);
  s.toAct = s.players.filter((p) => !p.folded && !p.allIn).length;
  if (s.street === "preflop") {
    s.street = "flop";
    s.community.push(s.deck.pop(), s.deck.pop(), s.deck.pop());
    s.message = "Flop.";
  } else if (s.street === "flop") {
    s.street = "turn";
    s.community.push(s.deck.pop());
    s.message = "Turn.";
  } else if (s.street === "turn") {
    s.street = "river";
    s.community.push(s.deck.pop());
    s.message = "River.";
  } else {
    showdown(s);
  }
  if (s.players.every((p) => p.folded || p.allIn) && s.street !== "showdown" && s.street !== "over") {
    while (s.community.length < 5) s.community.push(s.deck.pop());
    showdown(s);
  }
}
function showdown(s) {
  s.street = "showdown";
  const live = s.players.filter((p) => !p.folded);
  if (live.length === 1) {
    const only = live[0];
    if (only) {
      only.chips += s.pot;
      s.winnerId = only.id;
      s.message = `${only.name} wins the pot.`;
    }
  } else {
    const scores = s.players.map((p) => p.folded ? -1 : bestHand(p.hole, s.community));
    if (scores[0] === scores[1]) {
      s.players[0].chips += Math.floor(s.pot / 2);
      s.players[1].chips += Math.ceil(s.pot / 2);
      s.winnerId = null;
      s.message = "Split pot.";
    } else {
      const w = (scores[0] ?? 0) > (scores[1] ?? 0) ? 0 : 1;
      const winner = s.players[w];
      winner.chips += s.pot;
      s.winnerId = winner.id;
      s.message = `${winner.name} wins the pot.`;
    }
  }
  s.pot = 0;
  if (s.players.some((p) => p.chips <= 0)) {
    s.street = "over";
    const a = s.players[0];
    const b = s.players[1];
    const w = a.chips > b.chips ? a : b;
    s.winnerId = w.id;
    s.message = `${w.name} takes the table.`;
  }
}
function afterAct(s) {
  const live = s.players.filter((p) => !p.folded);
  if (live.length === 1) {
    showdown(s);
    return;
  }
  s.toAct -= 1;
  if (s.toAct <= 0 && s.players.filter((p) => !p.folded && !p.allIn).every((p) => p.bet === s.currentBet || p.allIn)) {
    nextStreet(s);
    return;
  }
  let n = other(s.turn);
  for (let k = 0; k < 2; k++) {
    const seat = s.players[n];
    if (!seat.folded && !seat.allIn) {
      s.turn = n;
      return;
    }
    n = other(n);
  }
  nextStreet(s);
}
function applyHoldemAction(s, playerId, action) {
  const next = structuredClone(s);
  if (next.street === "lobby") {
    if (action.type === "start" && next.players[0]?.id === playerId && next.players.length >= 2) {
      const [a, b] = next.players;
      return startHoldemDuel(a, b);
    }
    return next;
  }
  if (action.type === "start") return next;
  if (action.type === "next") {
    if (next.street !== "showdown") return next;
    if (next.players.some((p2) => p2.chips <= 0)) {
      next.street = "over";
      return next;
    }
    next.dealer = other(next.dealer);
    dealHand(next);
    return next;
  }
  if (next.street === "showdown" || next.street === "over") return next;
  const i = idxOf(next, playerId);
  if (next.turn !== i) throw new Error("Not your turn");
  const p = next.players[i];
  const toCall = next.currentBet - p.bet;
  if (action.type === "fold") {
    p.folded = true;
    next.message = `${p.name} folds.`;
    afterAct(next);
    return next;
  }
  if (action.type === "check") {
    if (toCall > 0) throw new Error("Cannot check");
    next.message = `${p.name} checks.`;
    afterAct(next);
    return next;
  }
  if (action.type === "call") {
    if (toCall <= 0) throw new Error("Nothing to call");
    post(next, i, toCall);
    next.message = `${p.name} calls.`;
    afterAct(next);
    return next;
  }
  if (action.type === "raise") {
    const bounds = raiseBounds(next, playerId);
    if (!bounds.canRaise) throw new Error("Nothing left to raise");
    const want = Math.floor(Number(action.amount));
    if (!Number.isFinite(want)) throw new Error("Bad raise");
    const total = Math.min(bounds.max, want);
    const goingAllIn = total >= bounds.max;
    if (!goingAllIn && total < bounds.minFull) throw new Error(`Min raise is ${bounds.minFull}`);
    if (!goingAllIn && total <= next.currentBet) throw new Error("Raise more");
    const opened = next.currentBet === 0;
    putIn(next, i, total - p.bet);
    next.message = p.allIn ? `${p.name} is all in.` : opened ? `${p.name} bets ${p.bet}.` : `${p.name} raises to ${p.bet}.`;
    afterAct(next);
    return next;
  }
  if (action.type === "allin") {
    if (p.chips <= 0) throw new Error("No chips");
    putIn(next, i, p.chips);
    next.message = `${p.name} is all in.`;
    afterAct(next);
    return next;
  }
  return next;
}
function viewHoldem(s, viewerId) {
  const v = structuredClone(s);
  const show = v.street === "showdown" || v.street === "over";
  for (const p of v.players) {
    if (p.id !== viewerId && !show) p.hole = p.hole.map((c) => ({ ...c, hidden: true }));
  }
  return v;
}
function holdemBotAct(s, botId) {
  const p = s.players[idxOf(s, botId)];
  const bounds = raiseBounds(s, botId);
  const score = bestHand(p.hole, s.community);
  if (bounds.toCall > 0 && score < 15 ** 5 && Math.random() < 0.35) return { type: "fold" };
  if (bounds.canRaise && score >= 2 * 15 ** 5) {
    if (Math.random() < 0.12 || !bounds.canFullRaise) return { type: "allin" };
    const potTo = Math.min(bounds.max, Math.max(bounds.minFull, s.pot + s.currentBet));
    return { type: "raise", amount: potTo };
  }
  if (bounds.toCall > 0) {
    if (bounds.toCall >= p.chips) return { type: "allin" };
    return { type: "call" };
  }
  return { type: "check" };
}
export {
  applyHoldemAction,
  bestHand,
  holdemBotAct,
  raiseBounds,
  startHoldemDuel,
  startHoldemLobby,
  startHoldemPractice,
  viewHoldem
};
