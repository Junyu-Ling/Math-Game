import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  aiDrawColor,
  aiGuess,
  aiShouldContinue,
  ARRANGE_MS,
  continueGuess,
  currentPlayer,
  deckCounts,
  drawCard,
  finishArrange,
  guessTile,
  insertIndices,
  selectTile,
  triedOnTile,
  setPendingSlot,
  playRps,
  finishRps,
  startCoda,
  stay,
  applyAction,
  OPENING,
  RPS_REVEAL_MS,
  type CodaAction,
  type CodaState,
  type CodaTile,
  type CodaValue,
  type RpsReveal,
  type RpsThrow,
} from "./engine";
import { MahjongTile } from "../../components/MahjongTile";
import { DeckStack } from "../../components/PlayingCard";
import { wait } from "../../lib/shuffle";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { InvitePanel } from "../../components/InvitePanel";

type Flash = {
  kind: "hit" | "miss" | "win" | "lose";
  playerId?: string;
  index?: number;
};

function statusText(state: CodaState, myTurn: boolean, remain: number, matching: boolean): string {
  if (matching) return "Waiting for the invite to be accepted.";
  if (state.phase === "lobby") {
    const ready = state.players.filter((p) => p.ready).length;
    return `Opening mix. Ready ${ready}/${state.players.length} — game starts when everyone is ready (2–4).`;
  }
  if (state.phase === "over") {
    const w = state.players.find((p) => p.id === state.winnerId);
    return w ? `${w.name} wins` : "Game over";
  }
  if (state.phase === "rps") {
    return "Rock-paper-scissors. The loser guesses first.";
  }
  if (state.phase === "arrange") {
    if (state.resume === "draw") {
      return `Opening arrange ${remain.toFixed(1)}s · tile stays out — tap a gap to insert`;
    }
    return `Arrange ${remain.toFixed(1)}s · wait the full 5 seconds even after you pick a slot`;
  }
  if (state.phase === "guess" && state.selected) {
    return myTurn ? "Tile locked. Guess the number. Both of you see the arrow." : "Your rival is aiming at a tile.";
  }
  if (!myTurn) return `${currentPlayer(state).name} is thinking…`;
  if (state.phase === "draw") return myTurn ? "Pick black or white and draw that color." : "A rival is choosing a draw color.";
  if (state.phase === "guess") return "Tap a hidden tile, then guess its number.";
  if (state.phase === "continue") return "Hit. Keep guessing, or stay and insert in secret.";
  return "";
}

function Row({
  tiles,
  hide,
  downRevealed,
  selectedIndex,
  flash,
  playerId,
  onTile,
  onGap,
  gaps,
  ghostAt,
  reserveSlot,
  fresh,
}: {
  tiles: CodaTile[];
  hide: boolean;
  downRevealed?: boolean;
  selectedIndex?: number;
  flash?: Flash | null;
  playerId?: string;
  onTile?: (i: number) => void;
  onGap?: (i: number) => void;
  gaps?: number[];
  ghostAt?: number | null;
  reserveSlot?: boolean;
  fresh?: Record<string, string>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const gapSet = new Set(gaps ?? []);
  const cells: { key: string; node: ReactNode }[] = [];
  const max = tiles.length;
  for (let i = 0; i <= max; i++) {
    if (gapSet.has(i)) {
      const chosen = ghostAt === i;
      cells.push({
        key: `g-${i}`,
        node: (
          <button
            className={`gap on ${chosen ? "ghost" : ""}`}
            type="button"
            onClick={() => onGap?.(i)}
            aria-label="Insert slot"
          >
            {chosen ? <span className="mj-arrow" aria-hidden /> : null}
          </button>
        ),
      });
    }
    const tile = tiles[i];
    if (tile) {
      const aimed = selectedIndex === i;
      const fxKind = flash && flash.playerId === playerId && flash.index === i ? flash.kind : null;
      const fx = fxKind === "hit" || fxKind === "miss" ? fxKind : null;
      cells.push({
        key: tile.id,
        node: (
          <MahjongTile
            tile={tile}
            hide={hide}
            selected={aimed}
            aimed={aimed && !tile.revealed}
            flash={fx}
            down={Boolean(downRevealed && tile.revealed)}
            fresh={Boolean(fresh?.[tile.id])}
            onClick={onTile ? () => onTile(i) : undefined}
          />
        ),
      });
    }
  }
  if (reserveSlot && gapSet.size === 0) {
    cells.push({
      key: "reserve",
      node: <span className="gap reserve" aria-hidden />,
    });
  }
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const row = rowRef.current;
    if (!wrap || !row) return;
    const fit = () => {
      const avail = wrap.clientWidth;
      if (avail < 8) return;
      const prev = row.style.zoom;
      row.style.zoom = "1";
      const need = Math.max(row.scrollWidth, row.getBoundingClientRect().width);
      row.style.zoom = prev;
      const next = need > avail ? Math.max(0.42, avail / need) : 1;
      setZoom((z) => (Math.abs(z - next) < 0.004 ? z : next));
    };
    fit();
    const ro = new ResizeObserver(() => requestAnimationFrame(fit));
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [tiles, gaps, ghostAt, reserveSlot]);

  return (
    <div className="tiles-fit" ref={wrapRef}>
      <div className="tiles" ref={rowRef} style={{ zoom }}>
        {cells.map((c) => (
          <span key={c.key}>{c.node}</span>
        ))}
      </div>
    </div>
  );
}

function OppSeat({
  player,
  className,
  tiles,
  opening,
  turn,
  flash,
  fresh,
  selectedIndex,
  onTile,
}: {
  player: { id: string; name: string; out: boolean };
  className: string;
  tiles: CodaTile[];
  opening: boolean;
  turn: boolean;
  flash?: Flash | null;
  fresh?: Record<string, string>;
  selectedIndex?: number;
  onTile: (i: number) => void;
}) {
  return (
    <div className={`seat ${className} ${opening ? "veiled" : ""}`}>
      <div className="seat-plaque">
        <b>{player.name}</b>
        <span>{player.out ? "OUT" : opening ? "Arrange" : turn ? "Turn" : "Wait"}</span>
      </div>
      <div className="tiles-wrap">
        {opening ? (
          <div className="arrange-veil" aria-hidden>
            <strong>Arranging</strong>
            <span>Order revealed in 5 seconds</span>
          </div>
        ) : null}
        <Row
          tiles={tiles}
          hide
          downRevealed
          playerId={player.id}
          selectedIndex={selectedIndex}
          flash={flash}
          reserveSlot
          fresh={fresh}
          onTile={onTile}
        />
      </div>
    </div>
  );
}

function outcomeFlash(next: CodaState, youId: string): Flash | null {
  if (next.phase !== "over" || !next.winnerId) return null;
  return { kind: next.winnerId === youId ? "win" : "lose" };
}

function applyGuess(state: CodaState, value: CodaValue, youId: string): { next: CodaState; flash: Flash | null } {
  const sel = state.selected;
  const next = guessTile(state, value);
  if (!sel || next.log.length === state.log.length) return { next, flash: null };
  const end = outcomeFlash(next, youId);
  if (end) return { next, flash: { ...end, playerId: sel.playerId, index: sel.index } };
  const added = next.log.slice(state.log.length);
  const hit = added.some((l) => l.text.includes("guessed"));
  const miss = added.some((l) => l.text.includes("missed"));
  const kind = hit ? "hit" : miss ? "miss" : null;
  return { next, flash: kind ? { kind, playerId: sel.playerId, index: sel.index } : null };
}

const BURST: Record<Flash["kind"], { title: string; sub: string }> = {
  hit: { title: "Hit", sub: "Correct. The tile knocks down." },
  miss: { title: "Miss", sub: "Wrong. Your drawn tile is shown." },
  win: { title: "You win", sub: "The other row is fully open." },
  lose: { title: "You lose", sub: "All of your tiles are open." },
};

const RPS_CHOICES: { id: RpsThrow; label: string }[] = [
  { id: "rock", label: "Rock" },
  { id: "scissors", label: "Scissors" },
  { id: "paper", label: "Paper" },
];

function aroundYou<T extends { id: string }>(players: T[], youId: string) {
  const i = Math.max(0, players.findIndex((p) => p.id === youId));
  const n = players.length;
  const at = (d: number) => players[(i + d) % n] ?? null;
  if (n <= 2) return { rival: at(1), left: null as T | null, right: null as T | null, partner: null as T | null };
  if (n === 3) return { rival: null as T | null, left: at(1), partner: null as T | null, right: at(2) };
  return { rival: null as T | null, left: at(1), partner: at(2), right: at(3) };
}

const RPS_CHANT = ["", "Rock", "Scissors", "Paper"] as const;

function rpsWinsThrow(a: RpsThrow, b: RpsThrow): boolean {
  return (a === "rock" && b === "scissors") || (a === "paper" && b === "rock") || (a === "scissors" && b === "paper");
}

function HandShape({ kind }: { kind: "fist" | RpsThrow }) {
  const pose = kind === "fist" ? "rock" : kind;
  return (
    <svg className="rps-svg" viewBox="0 0 140 140" aria-hidden>
      {pose === "rock" ? (
        <g fill="#f3c7a8" stroke="#c48a62" strokeWidth="4" strokeLinejoin="round">
          <ellipse cx="72" cy="86" rx="36" ry="30" />
          <rect x="44" y="42" width="18" height="48" rx="9" />
          <rect x="62" y="34" width="18" height="54" rx="9" />
          <rect x="80" y="36" width="18" height="52" rx="9" />
          <rect x="98" y="46" width="16" height="42" rx="8" />
          <ellipse cx="40" cy="80" rx="16" ry="13" />
        </g>
      ) : pose === "paper" ? (
        <g fill="#f3c7a8" stroke="#c48a62" strokeWidth="4" strokeLinejoin="round">
          <rect x="38" y="58" width="64" height="52" rx="16" />
          <rect x="40" y="18" width="14" height="52" rx="7" />
          <rect x="56" y="10" width="14" height="58" rx="7" />
          <rect x="72" y="12" width="14" height="56" rx="7" />
          <rect x="88" y="20" width="14" height="50" rx="7" />
          <ellipse cx="34" cy="86" rx="14" ry="12" transform="rotate(-28 34 86)" />
        </g>
      ) : (
        <g fill="#f3c7a8" stroke="#c48a62" strokeWidth="4" strokeLinejoin="round">
          <ellipse cx="70" cy="96" rx="34" ry="26" />
          <rect x="48" y="14" width="16" height="70" rx="8" transform="rotate(-12 56 49)" />
          <rect x="76" y="14" width="16" height="70" rx="8" transform="rotate(12 84 49)" />
          <rect x="42" y="72" width="18" height="28" rx="8" />
          <rect x="80" y="72" width="16" height="26" rx="8" />
          <ellipse cx="36" cy="92" rx="14" ry="11" />
        </g>
      )}
    </svg>
  );
}

function RpsHand({
  kind,
  side,
  pose,
  won,
}: {
  kind: "fist" | RpsThrow;
  side: "you" | "rival";
  pose: "idle" | "pump" | "show";
  won?: boolean | null;
}) {
  const winClass = won === true ? " win" : won === false ? " lose" : "";
  return (
    <div className={`rps-hand ${side} ${pose}${winClass}`}>
      <HandShape kind={kind} />
    </div>
  );
}

function rpsCaption(
  reveal: RpsReveal | null,
  myThrow: RpsThrow | undefined,
  waiting: boolean,
  shown: boolean,
  youId: string,
): string {
  if (reveal && shown) {
    if (reveal.a === reveal.b) return "Tie. Throw again.";
    const youThrow = reveal.aId === youId ? reveal.a : reveal.b;
    const foeThrow = reveal.aId === youId ? reveal.b : reveal.a;
    return rpsWinsThrow(youThrow, foeThrow) ? "You win. They guess first." : "You lose. You guess first.";
  }
  if (reveal) return "Throw.";
  if (waiting && myThrow) return "Ready. Waiting for the other hand.";
  return "Throw. Loser guesses first.";
}

export function DaVinciPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const codaRoom = lobby.room?.game === "coda" ? lobby.room : null;
  const [jokers, setJokers] = useState(true);
  const [blackN, setBlackN] = useState(2);
  const [whiteN, setWhiteN] = useState(2);
  const [seats, setSeats] = useState(2);
  const [state, setState] = useState<CodaState | null>(null);
  const [remain, setRemain] = useState(ARRANGE_MS / 1000);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [youId, setYouId] = useState<string | null>(null);
  const [rpsBeat, setRpsBeat] = useState(0);
  const endsAtRef = useRef<number | null>(null);
  const prevLog = useRef(0);
  const online = Boolean(codaRoom);
  const matching = Boolean(user && lobby.invites.some((i) => i.game === "coda" && i.fromId === user.id));

  const waiting = Boolean(state?.phase === "lobby");
  const playing = state !== null && !waiting;
  const you = state && (playing || waiting)
    ? (youId ? state.players.find((p) => p.id === youId) : state.players[0]) ?? state.players[0]
    : null;
  const others = playing && you ? state.players.filter((p) => p.id !== you.id) : [];
  const seated = you && state ? aroundYou(state.players, you.id) : { rival: null, left: null, right: null, partner: null };
  const rival = seated.rival ?? others[0] ?? null;
  const me = playing ? currentPlayer(state) : null;
  const arranging = Boolean(playing && state?.phase === "arrange");
  const opening = arranging && state?.resume === "draw";
  const rpsing = Boolean(playing && state?.phase === "rps");
  const myTurn = Boolean(you && me && me.id === you.id && state && state.phase !== "over" && !arranging && !rpsing);
  const humanRow = arranging && !opening && you && me?.id === you.id ? (state?.humanDraft ?? you.tiles) : (you?.tiles ?? []);
  const rivalRow = opening ? (state?.frozenRival ?? rival?.tiles ?? []) : (rival?.tiles ?? []);
  const myInsert = opening
    ? you?.stash ?? null
    : arranging && you && me?.id === you.id
      ? state?.pending ?? null
      : null;
  const insertOpts = myInsert ? insertIndices(humanRow, myInsert) : [];
  const autoSlot = myInsert
    ? opening
      ? (you && state?.stashSlots[you.id] !== undefined ? state.stashSlots[you.id]! : (insertOpts[0] ?? 0))
      : (state?.pendingSlot ?? insertOpts[0] ?? 0)
    : null;
  const arrangeGaps = arranging && myInsert ? insertOpts : [];

  function dispatch(action: CodaAction) {
    if (codaRoom) {
      void lobby.sendAction(action);
      return;
    }
    if (action.type === "draw") setState((s) => (s ? drawCard(s, action.color) : s));
    else if (action.type === "select") setState((s) => (s ? selectTile(s, action.playerId, action.index) : s));
    else if (action.type === "guess") {
      if (!state || !you) return;
      const { next, flash: fx } = applyGuess(state, action.value, you.id);
      setState(next);
      if (fx) setFlash(fx);
    } else if (action.type === "continue") setState((s) => (s ? continueGuess(s) : s));
    else if (action.type === "stay") setState((s) => (s ? stay(s) : s));
    else if (action.type === "slot") setState((s) => (s ? setPendingSlot(s, action.index, you?.id) : s));
    else if (action.type === "rps") setState((s) => (s ? playRps(s, action.throw, you?.id) : s));
    else if (action.type === "pick" || action.type === "ready") {
      setState((s) => (s && you ? applyAction(s, you.id, action) : s));
    }
  }

  useEffect(() => {
    if (!state?.rpsReveal) {
      setRpsBeat(0);
      return;
    }
    setRpsBeat(1);
    const t1 = window.setTimeout(() => setRpsBeat(2), 520);
    const t2 = window.setTimeout(() => setRpsBeat(3), 1040);
    const t3 = window.setTimeout(() => setRpsBeat(4), 1560);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [state?.rpsReveal]);

  useEffect(() => {
    if (!state?.rpsReveal || online) return;
    const t = window.setTimeout(() => setState((s) => (s ? finishRps(s) : s)), RPS_REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [state?.rpsReveal, online]);

  useEffect(() => {
    if (!arranging) return;
    const start = endsAtRef.current ? endsAtRef.current - ARRANGE_MS : Date.now();
    const tick = () => {
      const deadline = endsAtRef.current ?? start + ARRANGE_MS;
      const left = Math.max(0, deadline - Date.now());
      setRemain(left / 1000);
      if (left <= 0) {
        window.clearInterval(id);
        if (!online) setState((s) => (s ? finishArrange(s) : s));
      }
    };
    tick();
    const id = window.setInterval(tick, 50);
    return () => window.clearInterval(id);
  }, [state?.arrangeId, arranging, online]);

  useEffect(() => {
    if (!flash) return;
    if (flash.kind === "win" || flash.kind === "lose") return;
    const t = window.setTimeout(() => setFlash(null), 420);
    return () => window.clearTimeout(t);
  }, [flash]);

  useEffect(() => {
    if (!state || state.phase !== "over" || !state.winnerId || !you) return;
    setFlash((cur) => {
      if (cur?.kind === "win" || cur?.kind === "lose") return cur;
      return { kind: state.winnerId === you.id ? "win" : "lose" };
    });
  }, [state, you]);

  useEffect(() => {
    if (!state || online) return;
    if (!me || me.human || state.phase === "over" || arranging || state.phase === "rps" || state.phase === "lobby") return;
    let stop = false;
    (async () => {
      await wait(180);
      if (stop) return;
      if (state.phase === "draw") {
        setState((s) => (s ? drawCard(s, aiDrawColor(s)) : s));
        return;
      }
      if (state.phase === "guess") {
        const g = aiGuess(state);
        if (!g) return;
        const locked =
          state.selected && state.selected.playerId === g.playerId && state.selected.index === g.index;
        if (!locked) {
          setState((s) => (s ? selectTile(s, g.playerId, g.index) : s));
          return;
        }
        await wait(220);
        if (stop) return;
        const { next, flash: fx } = applyGuess(state, g.value, you?.id ?? "");
        setState(next);
        if (fx) setFlash(fx);
        return;
      }
      if (state.phase === "continue") {
        await wait(240);
        if (stop) return;
        setState((s) => (s ? (aiShouldContinue(s) ? continueGuess(s) : stay(s)) : s));
      }
    })();
    return () => {
      stop = true;
    };
  }, [state, me, arranging, online, you?.id]);

  const numbers = useMemo(() => Array.from({ length: 12 }, (_, i) => i), []);
  const showDrawn = Boolean(
    (state?.drawn && (myTurn || me?.id === you?.id || (state.drawn.revealed && arranging))) ||
      (opening && you?.stash),
  );
  const drawnTile = opening && you?.stash ? you.stash : state?.drawn;
  const aimedRival = state?.selected && rival && state.selected.playerId === rival.id ? state.selected.index : undefined;
  const aimedYou = state?.selected && you && state.selected.playerId === you.id ? state.selected.index : undefined;
  const selectedTried = new Set(
    playing && state?.selected ? triedOnTile(state, state.selected.playerId, state.selected.index) : [],
  );
  const rpsReveal = state?.rpsReveal ?? null;
  const myRpsThrow = you ? state?.rpsThrows[you.id] : undefined;
  const rpsShown = rpsBeat >= 4 && Boolean(rpsReveal);
  const rpsPumping = rpsBeat >= 1 && rpsBeat <= 3 && Boolean(rpsReveal);
  const rpsPose = rpsPumping ? "pump" : rpsShown ? "show" : "idle";
  const youRpsKind: "fist" | RpsThrow =
    rpsShown && rpsReveal && you ? (rpsReveal.aId === you.id ? rpsReveal.a : rpsReveal.b) : "fist";
  const rivalRpsKind: "fist" | RpsThrow =
    rpsShown && rpsReveal && rival ? (rpsReveal.aId === rival.id ? rpsReveal.a : rpsReveal.b) : "fist";
  const youRpsWon =
    rpsShown && rpsReveal && rpsReveal.a !== rpsReveal.b && youRpsKind !== "fist" && rivalRpsKind !== "fist"
      ? rpsWinsThrow(youRpsKind, rivalRpsKind)
      : null;
  const rpsChant = rpsPumping ? RPS_CHANT[rpsBeat] : "vs";
  const rpsLocked = Boolean(myRpsThrow || rpsReveal);

  function setBlack(n: number) {
    const black = Math.max(0, Math.min(OPENING, n));
    setBlackN(black);
    setWhiteN(OPENING - black);
    if (waiting && you) dispatch({ type: "pick", black, white: OPENING - black });
  }

  function setWhite(n: number) {
    const white = Math.max(0, Math.min(OPENING, n));
    setWhiteN(white);
    setBlackN(OPENING - white);
    if (waiting && you) dispatch({ type: "pick", black: OPENING - white, white });
  }

  function resetTable() {
    setFlash(null);
    setState(null);
    setYouId(null);
    endsAtRef.current = null;
    prevLog.current = 0;
    if (codaRoom) void lobby.leave();
  }

  function beginPractice() {
    if (codaRoom) void lobby.leave();
    setFlash(null);
    setYouId("you");
    setState(startCoda(jokers, blackN, whiteN, seats));
  }

  useEffect(() => {
    if (!codaRoom) return;
    const view = codaRoom.view as CodaState;
    setYouId(user?.id ?? null);
    setState((prev) => {
      if (prev && view.log.length > prev.log.length) {
        const added = view.log.slice(prev.log.length);
        const sel = view.selected ?? prev.selected;
        if (added.some((l) => l.text.includes("guessed")) && sel) {
          setFlash({ kind: "hit", playerId: sel.playerId, index: sel.index });
        } else if (added.some((l) => l.text.includes("missed")) && sel) {
          setFlash({ kind: "miss", playerId: sel.playerId, index: sel.index });
        }
      }
      prevLog.current = view.log.length;
      return view;
    });
    endsAtRef.current = codaRoom.endsAt;
  }, [codaRoom, user?.id]);

  return (
    <div className="page-wide coda-page">
      <div className="game-head">
        <div>
          <p className="kicker">01 / CODA</p>
          <h1>Da Vinci Code</h1>
        </div>
        <div className="row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              setJokers((v) => !v);
              if (playing) resetTable();
            }}
          >
            {jokers ? "JOKER ON" : "JOKER OFF"}
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => resetTable()}>
            RESET
          </button>
          <Link className="btn btn-ghost" to="/">
            LEAVE
          </Link>
        </div>
      </div>
      <div className="game-layout">
        <div className={`table table-coda ${flash ? `table-${flash.kind}` : ""} ${playing && state && state.players.length > 2 ? "coda-multi" : ""}`}>
          <div className="coda-lamp" />
          <div className="coda-ring" />
          {!playing || !you || !state || others.length < 1 ? (
            <div className="coda-deal">
              <p className="kicker">{waiting ? "TABLE" : matching ? "INVITE" : "OPENING DRAW"}</p>
              <h2>{waiting ? `Table ${state?.players.length ?? 0}/4` : matching ? "Invite pending" : "Opening draw"}</h2>
              <p>
                {waiting
                  ? "Each player picks how many black and white tiles to start with (4 total), then ready. Game starts when everyone is ready."
                  : matching
                    ? "Waiting for them to accept."
                    : `2–4 players. Start with ${OPENING} tiles. Sign in to invite; everyone picks their own mix before the deal.`}
              </p>
              {waiting && state ? (
                <ul className="lobby-roster">
                  {state.players.map((p) => (
                    <li key={p.id}>
                      <b>{p.name}</b>
                      <span>
                        black {p.black ?? 2} · white {p.white ?? 2}
                        {p.ready ? " · ready" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!matching || waiting ? (
                <>
                  <div className="deal-colors">
                    <div className="deal-color black">
                      <span>BLACK</span>
                      <div className="deal-step">
                        <button type="button" disabled={blackN <= 0} onClick={() => setBlack(blackN - 1)}>
                          −
                        </button>
                        <b>{blackN}</b>
                        <button type="button" disabled={blackN >= OPENING} onClick={() => setBlack(blackN + 1)}>
                          +
                        </button>
                      </div>
                    </div>
                    <div className="deal-color white">
                      <span>WHITE</span>
                      <div className="deal-step">
                        <button type="button" disabled={whiteN <= 0} onClick={() => setWhite(whiteN - 1)}>
                          −
                        </button>
                        <b>{whiteN}</b>
                        <button type="button" disabled={whiteN >= OPENING} onClick={() => setWhite(whiteN + 1)}>
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="deal-preview" aria-hidden>
                    {Array.from({ length: blackN }, (_, i) => (
                      <MahjongTile key={`b-${i}`} tile={{ color: "black", value: 0, revealed: false }} hide mini />
                    ))}
                    {Array.from({ length: whiteN }, (_, i) => (
                      <MahjongTile key={`w-${i}`} tile={{ color: "white", value: 0, revealed: false }} hide mini />
                    ))}
                  </div>
                  {!waiting ? (
                    <div className="deal-seats" role="group" aria-label="Players">
                      {[2, 3, 4].map((n) => (
                        <button
                          key={n}
                          className={`btn ${seats === n ? "" : "btn-ghost"}`}
                          type="button"
                          onClick={() => setSeats(n)}
                        >
                          {n}P
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="row-actions" style={{ justifyContent: "center" }}>
                    {waiting ? (
                      <button className="btn" type="button" disabled={Boolean(you?.ready)} onClick={() => dispatch({ type: "ready" })}>
                        {you?.ready ? "Waiting for others" : "Ready"}
                      </button>
                    ) : (
                      <button className="btn" type="button" onClick={beginPractice}>
                        Practice vs CPU
                      </button>
                    )}
                  </div>
                </>
              ) : (
                <button className="btn btn-ghost" type="button" onClick={resetTable}>
                  Cancel invite
                </button>
              )}
            </div>
          ) : (
            <>
          {seated.partner ? (
            <OppSeat
              player={seated.partner}
              className="seat-partner"
              tiles={seated.partner.tiles}
              opening={opening}
              turn={me?.id === seated.partner.id}
              flash={flash}
              fresh={state.fresh}
              selectedIndex={state.selected?.playerId === seated.partner.id ? state.selected.index : undefined}
              onTile={(i) => myTurn && state.phase === "guess" && dispatch({ type: "select", playerId: seated.partner!.id, index: i })}
            />
          ) : null}
          {seated.rival ? (
            <OppSeat
              player={seated.rival}
              className="seat-rival"
              tiles={rivalRow}
              opening={opening}
              turn={me?.id === seated.rival.id}
              flash={flash}
              fresh={state.fresh}
              selectedIndex={aimedRival}
              onTile={(i) => myTurn && state.phase === "guess" && dispatch({ type: "select", playerId: seated.rival!.id, index: i })}
            />
          ) : null}
          {seated.left ? (
            <OppSeat
              player={seated.left}
              className="seat-left"
              tiles={seated.left.tiles}
              opening={opening}
              turn={me?.id === seated.left.id}
              flash={flash}
              fresh={state.fresh}
              selectedIndex={state.selected?.playerId === seated.left.id ? state.selected.index : undefined}
              onTile={(i) => myTurn && state.phase === "guess" && dispatch({ type: "select", playerId: seated.left!.id, index: i })}
            />
          ) : null}

          <div className="center-well">
            <div className="coda-center-tools">
              <div className={`coda-tool ${arranging ? "" : "is-idle"}`}>
                <div className="arrange-clock" aria-live={arranging ? "polite" : "off"}>
                  <svg viewBox="0 0 100 100" aria-hidden="true">
                    <circle className="arrange-track" cx="50" cy="50" r="40" />
                    <circle
                      className="arrange-progress"
                      cx="50"
                      cy="50"
                      r="40"
                      strokeDasharray={2 * Math.PI * 40}
                      strokeDashoffset={2 * Math.PI * 40 * (1 - Math.max(0, Math.min(1, remain / (ARRANGE_MS / 1000))))}
                    />
                  </svg>
                  <div className="arrange-clock-face">
                    <b>{arranging ? Math.ceil(remain) : 5}</b>
                    <span>{opening ? "Opening" : "Insert"}</span>
                  </div>
                </div>
              </div>
              <div className={`coda-tool ${arranging ? "is-idle" : ""}`}>
                <div className="draw-picks">
                  <DeckStack count={state.deck.length} label="Deck" />
                  <div className="draw-colors">
                    {(["black", "white"] as const).map((color) => {
                      const n = deckCounts(state)[color];
                      const canDraw = state.phase === "draw" && myTurn && n > 0;
                      return (
                        <button
                          key={color}
                          className={`btn draw-color-btn ${color}`}
                          type="button"
                          disabled={!canDraw}
                          onClick={() => dispatch({ type: "draw", color })}
                        >
                          Draw {color === "black" ? "black" : "white"} · {n}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="hand-card">
              <div className="seat-label">{arranging ? "To insert" : "Drawn tile"}</div>
              {showDrawn && drawnTile ? (
                <MahjongTile tile={drawnTile} hide={!drawnTile.revealed && me?.id !== you.id} />
              ) : (
                <MahjongTile tile={{ color: "black", value: 0, revealed: false }} hide dim />
              )}
            </div>
          </div>

          {seated.right ? (
            <OppSeat
              player={seated.right}
              className="seat-right"
              tiles={seated.right.tiles}
              opening={opening}
              turn={me?.id === seated.right.id}
              flash={flash}
              fresh={state.fresh}
              selectedIndex={state.selected?.playerId === seated.right.id ? state.selected.index : undefined}
              onTile={(i) => myTurn && state.phase === "guess" && dispatch({ type: "select", playerId: seated.right!.id, index: i })}
            />
          ) : null}

          <div className="seat seat-you">
            <div className="seat-plaque you">
              <b>{you.name}</b>
              <span>
                {you.out ? "OUT" : opening ? "Arrange" : arranging ? "Insert" : me?.id === you.id ? "Turn" : "Wait"}
              </span>
            </div>
            <div className="tiles-wrap">
              <Row
                tiles={humanRow}
                hide={false}
                downRevealed
                playerId={you.id}
                selectedIndex={aimedYou}
                flash={flash}
                reserveSlot
                fresh={state.fresh}
                gaps={arrangeGaps}
                ghostAt={myInsert ? autoSlot : null}
                onGap={(i) => {
                  if (!arranging || !myInsert) return;
                  dispatch({ type: "slot", index: i });
                }}
              />
            </div>
          </div>

          {rpsing && you && rival && state ? (
            <div className="coda-deal coda-rps">
              <p className="kicker">Rock paper scissors</p>
              <div className="rps-arena">
                <div className="rps-side rival">
                  <span className="rps-name">{rival.name}</span>
                  <RpsHand
                    key={`rival-${rpsBeat}-${rivalRpsKind}`}
                    kind={rivalRpsKind}
                    side="rival"
                    pose={rpsPose}
                    won={youRpsWon === null ? null : !youRpsWon}
                  />
                </div>
                <div key={rpsBeat} className={`rps-mid${rpsPumping ? " chant" : ""}`} aria-live="polite">
                  {rpsChant}
                </div>
                <div className="rps-side you">
                  <RpsHand
                    key={`you-${rpsBeat}-${youRpsKind}`}
                    kind={youRpsKind}
                    side="you"
                    pose={rpsPose}
                    won={youRpsWon}
                  />
                  <span className="rps-name">{you.name}</span>
                </div>
              </div>
              <p>{rpsCaption(rpsReveal, myRpsThrow, rpsLocked, rpsShown, you.id)}</p>
              <div className="rps-row">
                {RPS_CHOICES.map((c) => (
                  <button
                    key={c.id}
                    className={`rps-pick${myRpsThrow === c.id ? " on" : ""}`}
                    type="button"
                    disabled={rpsLocked}
                    onClick={() => dispatch({ type: "rps", throw: c.id })}
                  >
                    <HandShape kind={c.id} />
                    <b>{c.label}</b>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {flash ? (
            <div className={`coda-burst ${flash.kind}`} aria-live="assertive">
              <div>
                <strong>{BURST[flash.kind].title}</strong>
                <span>{BURST[flash.kind].sub}</span>
                {(flash.kind === "win" || flash.kind === "lose") && (
                  <button className="btn burst-again" type="button" onClick={resetTable}>
                    Play again
                  </button>
                )}
              </div>
            </div>
          ) : null}
            </>
          )}
        </div>

        <div className="side-stack">
        <InvitePanel game="coda" meta={{ useJokers: jokers }} />
        <aside className="side coda-panel">
          <div>
            <h3>STATUS</h3>
            <p className="status-line">
              {matching
                ? statusText(state ?? ({} as CodaState), false, remain, true)
                : waiting && state
                  ? statusText(state, false, remain, false)
                  : playing && state
                    ? statusText(state, myTurn, remain, false)
                    : `Opening mix: black ${blackN} · white ${whiteN}${seats > 2 ? ` · ${seats}P` : ""}`}
            </p>
          </div>
          {playing && state && (state.phase === "draw" || state.phase === "guess" || state.phase === "continue") ? (
            <div className="coda-play-actions">
              <div>
                <h3>Guess {state.selected ? "· locked" : "· tap a hidden tile first"}</h3>
                <div className="pad">
                  {numbers.map((n) => {
                    const used = selectedTried.has(n);
                    const canGuess = state.phase === "guess" && myTurn && Boolean(state.selected) && !used;
                    return (
                      <button
                        key={n}
                        type="button"
                        className={used ? "tried" : ""}
                        disabled={!canGuess}
                        onClick={() => dispatch({ type: "guess", value: n })}
                      >
                        {n}
                      </button>
                    );
                  })}
                  {jokers ? (
                    <button
                      type="button"
                      className={selectedTried.has("joker") ? "tried" : ""}
                      disabled={!(state.phase === "guess" && myTurn && state.selected) || selectedTried.has("joker")}
                      onClick={() => dispatch({ type: "guess", value: "joker" })}
                    >
                      —
                    </button>
                  ) : (
                    <span className="pad-slot-reserve" aria-hidden />
                  )}
                </div>
              </div>
              <div className="row-actions coda-continue">
                <button
                  className="btn btn-go"
                  type="button"
                  disabled={!(state.phase === "continue" && myTurn)}
                  onClick={() => dispatch({ type: "continue" })}
                >
                  HIT AGAIN
                </button>
                <button
                  className="btn btn-gold"
                  type="button"
                  disabled={!(state.phase === "continue" && myTurn)}
                  onClick={() => dispatch({ type: "stay" })}
                >
                  STAY
                </button>
              </div>
            </div>
          ) : null}
          <div>
            <h3>RULE</h3>
            <ul>
              <li>2–4 players. Each player picks their own black/white opening mix, then ready. The deal waits until everyone is ready.</li>
              <li>On your draw, pick black or white. You cannot draw a color that is gone.</li>
              <li>Each color has 0–11 plus one dash. The dash is shuffled in with the numbers, so it is not guaranteed in the opening 4.</li>
              <li>The veil is opening-only. Inserts wait the full 5 seconds even after you pick a slot.</li>
              <li>After the opening 4, play rock-paper-scissors. The loser guesses first.</li>
            </ul>
          </div>
          <div>
            <h3>LOG</h3>
            <div className="log">
              {playing && state
                ? [...state.log].reverse().map((l) => (
                    <div key={l.id} className={l.tone}>
                      {l.text}
                    </div>
                  ))
                : null}
            </div>
          </div>
        </aside>
        </div>
      </div>
    </div>
  );
}
