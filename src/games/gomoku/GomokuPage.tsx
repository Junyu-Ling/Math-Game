import { useEffect, useState } from "react";
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
import { GameSetup } from "../../components/GameSetup";
import { InvitePanel } from "../../components/InvitePanel";
import { GameRules } from "../../components/GameRules";
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

export function GomokuPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "gomoku" ? lobby.room : null;
  const [local, setLocal] = useState<GState | null>(null);
  const [rpsBeat, setRpsBeat] = useState(0);
  const state = (room?.view as GState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const online = Boolean(room);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const rival = state?.players.find((p) => p.id !== youId);
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
    if (!state?.rpsReveal || online) return;
    const t = window.setTimeout(() => setLocal((s) => (s ? finishGomokuRps(s) : s)), RPS_REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [state?.rpsReveal, online]);

  useEffect(() => {
    if (!practice || !local || local.phase === "over") return;
    const cpu = local.players.find((p) => !p.human);
    if (!cpu) return;
    if (local.phase === "rps" && (local.rpsReveal || local.rpsThrows[cpu.id])) return;
    if (local.phase === "play") {
      const actor = local.players[local.turn];
      if (!actor || actor.human) return;
    } else if (local.phase !== "rps") {
      return;
    }
    let stop = false;
    void (async () => {
      await wait(CPU_THINK_MS);
      if (stop) return;
      setLocal((s) => {
        if (!s || s.phase === "over") return s;
        if (s.phase === "rps") {
          const bot = s.players.find((p) => !p.human);
          if (!bot || s.rpsReveal || s.rpsThrows[bot.id]) return s;
          return applyGomokuAction(s, bot.id, aiGomoku(s));
        }
        const bot = s.players[s.turn];
        if (!bot || bot.human) return s;
        return applyGomokuAction(s, bot.id, aiGomoku(s));
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
    setLocal((s) => (s && me ? applyGomokuAction(s, me.id, action) : s));
  }

  const rpsReveal = state?.rpsReveal ?? null;
  const myRpsThrow = me ? state?.rpsThrows[me.id] : undefined;
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
          {!state || !me ? (
            <GameSetup
              kicker="GOMOKU"
              title="Five in a row"
              blurb="15×15. RPS winner plays black. Five wins. Black fouls: double open three, double open four, overline."
              game="gomoku"
              onPractice={() => setLocal(startGomokuPractice())}
            />
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
                    return (
                      <button
                        key={`${r}-${c}`}
                        type="button"
                        className={`gomoku-cell${hoshi ? " star" : ""}${v ? " filled" : ""}${last ? " last" : ""}${foulCell ? " foul" : ""}`}
                        disabled={!myTurn || Boolean(v) || state.phase !== "play"}
                        onClick={() => act({ type: "place", r, c })}
                      >
                        {hoshi && !v ? <span className="gomoku-hoshi" /> : null}
                        {v ? <span className={`gomoku-stone ${v === 1 ? "black" : "white"}`} /> : null}
                      </button>
                    );
                  }),
                )}
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
