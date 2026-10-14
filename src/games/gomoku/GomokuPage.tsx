import { useEffect, useRef, useState } from "react";
import {
  RPS_REVEAL_MS,
  SIZE,
  aiGomoku,
  applyGomokuAction,
  finishGomokuRps,
  foulLabel,
  startGomokuPractice,
  type GAction,
  type GState,
  type RpsThrow,
} from "./engine";
import { InvitePanel } from "../../components/InvitePanel";
import { GameRules } from "../../components/GameRules";
import { MixedCpuBar, seatTag } from "../../components/MixedCpuBar";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

const RPS_CHOICES: Array<{ id: RpsThrow; label: string }> = [
  { id: "rock", label: "Rock" },
  { id: "paper", label: "Paper" },
  { id: "scissors", label: "Scissors" },
];
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

/** Red strike that grows along the five winning stones. */
function WinStrike({ line }: { line: Array<{ r: number; c: number }> }) {
  const pathRef = useRef<SVGLineElement | null>(null);
  const a = line[0]!;
  const b = line[line.length - 1]!;
  // Extend a bit past the end stones so the tip sits over the stones.
  const dx = b.c - a.c;
  const dy = b.r - a.r;
  const len = Math.hypot(dx, dy) || 1;
  const pad = 0.12;
  const x1 = a.c + 0.5 - (dx / len) * pad;
  const y1 = a.r + 0.5 - (dy / len) * pad;
  const x2 = b.c + 0.5 + (dx / len) * pad;
  const y2 = b.r + 0.5 + (dy / len) * pad;

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const total = el.getTotalLength();
    el.style.strokeDasharray = `${total}`;
    el.style.strokeDashoffset = `${total}`;
    // Force layout so the transition starts from the hidden state.
    void el.getBoundingClientRect();
    el.style.transition = "stroke-dashoffset 0.95s ease-out";
    el.style.strokeDashoffset = "0";
  }, [x1, y1, x2, y2]);

  return (
    <svg className="gomoku-win-svg" viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
      <line ref={pathRef} className="gomoku-win-stroke" x1={x1} y1={y1} x2={x2} y2={y2} />
    </svg>
  );
}

export function GomokuPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "gomoku" ? lobby.room : null;
  const [local, setLocal] = useState<GState | null>(null);
  const [rpsBeat, setRpsBeat] = useState(0);
  const state = (room?.view as GState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const rival = state?.players.find((p) => p.id !== youId);
  const waiting = Boolean(state?.phase === "lobby");
  const host = Boolean(user && room?.seats?.[0] === user.id);
  const myTurn = Boolean(state && me && state.players[state.turn]?.id === me.id && state.phase === "play");

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

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
    if (!practice || !local?.rpsReveal) return;
    const t = window.setTimeout(() => {
      setLocal((s) => (s?.rpsReveal ? finishGomokuRps(s) : s));
    }, RPS_REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [practice, local?.rpsReveal]);

  useEffect(() => {
    if (!practice || !local || local.phase === "over" || local.rpsReveal) return;
    let stop = false;
    void (async () => {
      if (local.phase === "rps") {
        const cpu = local.players.find((p) => !p.human && !local.rpsThrows?.[p.id]);
        if (!cpu) return;
        await wait(CPU_THINK_MS);
        if (stop) return;
        setLocal((s) => {
          if (!s || s.phase !== "rps" || s.rpsReveal) return s;
          const c = s.players.find((p) => !p.human && !s.rpsThrows?.[p.id]);
          return c ? applyGomokuAction(s, c.id, aiGomoku(s)) : s;
        });
        return;
      }
      if (local.phase !== "play") return;
      const actor = local.players[local.turn];
      if (!actor || actor.human) return;
      await wait(CPU_THINK_MS);
      if (stop) return;
      setLocal((s) => {
        if (!s || s.phase !== "play") return s;
        const cur = s.players[s.turn];
        return cur && !cur.human ? applyGomokuAction(s, cur.id, aiGomoku(s)) : s;
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: GAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => (s ? applyGomokuAction(s, "you", action) : s));
  }

  const rpsReveal = state?.rpsReveal ?? null;
  const myRpsThrow = me ? state?.rpsThrows?.[me.id] : undefined;
  const rpsShown = rpsBeat >= 4 && Boolean(rpsReveal);
  const rpsPumping = rpsBeat >= 1 && rpsBeat <= 3 && Boolean(rpsReveal);
  const rpsPose = rpsPumping ? "pump" : rpsShown ? "show" : "idle";
  const youRpsKind: "fist" | RpsThrow =
    rpsShown && rpsReveal && me ? (rpsReveal.aId === me.id ? rpsReveal.a : rpsReveal.b) : "fist";
  const rivalRpsKind: "fist" | RpsThrow =
    rpsShown && rpsReveal && rival ? (rpsReveal.aId === rival.id ? rpsReveal.a : rpsReveal.b) : "fist";
  const youRpsWon =
    rpsShown && rpsReveal && rpsReveal.a !== rpsReveal.b && youRpsKind !== "fist" && rivalRpsKind !== "fist"
      ? rpsWinsThrow(youRpsKind, rivalRpsKind)
      : null;
  const rpsChant = rpsPumping ? RPS_CHANT[rpsBeat] : "vs";
  const rpsLocked = Boolean(myRpsThrow || rpsReveal);

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">09 / GOMOKU · Duel</p>
          <h1>Gomoku</h1>
        </div>
        <div className="row-actions">
          {practice ? (
            <button className="btn btn-ghost" type="button" onClick={() => setLocal(null)}>
              RESET
            </button>
          ) : null}
          <button className="btn btn-ghost" type="button" onClick={() => void lobby.leaveHome()}>
            LEAVE
          </button>
        </div>
      </div>
      <div className="game-layout">
        <div className="table table-gomoku">
          {!state || !me || waiting ? (
            <div className="coda-deal">
              <p className="kicker">{waiting ? "TABLE" : "GOMOKU"}</p>
              <h2>{waiting ? `Table ${state?.players.length ?? 0}/2` : "Five in a row"}</h2>
              <p>
                {waiting
                  ? "Add a CPU or invite one friend, then start. RPS winner plays black."
                  : "15×15 Renju. Practice vs CPU, or open a table to invite. Black fouls: double open three, double open four, overline."}
              </p>
              {waiting && state ? (
                <ul className="lobby-roster">
                  {state.players.map((p, i) => (
                    <li key={p.id}>
                      <b>{p.name}</b>
                      <span>{seatTag(p, i, state.players[0]?.id)}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              <MixedCpuBar game="gomoku" onPractice={() => setLocal(startGomokuPractice())} />
              <div className="row-actions" style={{ justifyContent: "center" }}>
                {waiting ? (
                  host && (state?.players.length ?? 0) >= 2 ? (
                    <button className="btn" type="button" onClick={() => act({ type: "start" })}>
                      Start
                    </button>
                  ) : (
                    <p>{host ? "Need 2 players to start." : "Waiting for the host to start."}</p>
                  )
                ) : null}
              </div>
            </div>
          ) : state.phase === "rps" ? (
            <div className="coda-deal coda-rps">
              <p className="status-line">Winner plays black</p>
              <div className="rps-arena">
                <div className="rps-side rival">
                  <span className="rps-name">{rival?.name}</span>
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
                  <span className="rps-name">{me.name}</span>
                </div>
              </div>
              <p className="status-line">
                {rpsReveal && rpsShown
                  ? rpsReveal.a === rpsReveal.b
                    ? "Tie — throw again."
                    : youRpsWon
                      ? "You win. You play black."
                      : "You lose. You play white."
                  : rpsReveal
                    ? "…"
                    : myRpsThrow
                      ? "Waiting for rival…"
                      : "Throw. Winner plays black."}
              </p>
              <div className="rps-row">
                {RPS_CHOICES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`rps-pick${myRpsThrow === c.id ? " on" : ""}`}
                    disabled={rpsLocked}
                    onClick={() => act({ type: "rps", throw: c.id })}
                  >
                    <HandShape kind={c.id} />
                    <b>{c.label}</b>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="kaiji-board-wrap">
              <p className="status-line">
                {state.phase === "over"
                  ? state.foul
                    ? `Black foul (${foulLabel(state.foul.kind)}) — ${state.players.find((p) => p.id === state.winnerId)?.name || "White"} wins`
                    : state.winnerId
                      ? `${state.players.find((p) => p.id === state.winnerId)?.name} wins`
                      : "Draw"
                  : `${state.players[state.turn]?.name}'s turn · you are ${me.stone === 1 ? "black" : "white"}`}
              </p>
              {state.foul ? (
                <p className="gomoku-foul-tip" role="alert">
                  Foul loss: Black played <strong>{foulLabel(state.foul.kind)}</strong> at (
                  {state.foul.r + 1},{state.foul.c + 1}). Forbidden: double open three, double open four,
                  overline.
                </p>
              ) : null}
              <div className="gomoku-board" role="grid" aria-label="15 by 15 goban">
                {Array.from({ length: SIZE }, (_, r) =>
                  Array.from({ length: SIZE }, (_, c) => {
                    const v = state.board[r]![c]!;
                    const hoshi =
                      (r === 3 && (c === 3 || c === 11)) ||
                      (r === 11 && (c === 3 || c === 11)) ||
                      (r === 7 && c === 7);
                    const last = state.last?.r === r && state.last?.c === c;
                    const foulCell = state.foul?.r === r && state.foul?.c === c;
                    const onWin = Boolean(state.winLine?.some((p) => p.r === r && p.c === c));
                    return (
                      <button
                        key={`${r}-${c}`}
                        type="button"
                        className={`gomoku-cell${hoshi ? " star" : ""}${v ? " filled" : ""}${last ? " last" : ""}${foulCell ? " foul" : ""}${onWin ? " win" : ""}${!myTurn && state.phase === "play" && !v ? " waiting" : ""}`}
                        disabled={Boolean(v) || state.phase !== "play"}
                        onClick={() => {
                          if (!myTurn) return;
                          act({ type: "place", r, c });
                        }}
                      >
                        {hoshi && !v ? <span className="gomoku-hoshi" /> : null}
                        {v ? <span className={`gomoku-stone ${v === 1 ? "black" : "white"}`} /> : null}
                      </button>
                    );
                  }),
                )}
                {state.winLine && state.winLine.length >= 2 ? <WinStrike line={state.winLine} /> : null}
              </div>
            </div>
          )}
        </div>
        <div className="side-stack">
          <InvitePanel game="gomoku" />
          <aside className="side">
            <GameRules game="gomoku" />
            {state ? (
              <div>
                <h3>LOG</h3>
                <div className="log">
                  {[...state.log].reverse().slice(0, 12).map((l) => (
                    <div key={l.id}>{l.text}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
