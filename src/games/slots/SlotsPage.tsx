import { useEffect, useState } from "react";
import {
  PAYTABLE,
  SYMBOL_LABEL,
  ackResult,
  beginSpin,
  finishSpin,
  resetSlots,
  setBet,
  startSlots,
  type SlotsState,
  type SymbolId,
} from "./engine";
import { GameRules } from "../../components/GameRules";
import { useAuth } from "../../context/AuthContext";

const BETS = [1, 5, 10, 25, 50, 100];

const GLYPH: Record<SymbolId, string> = {
  cherry: "🍒",
  lemon: "🍋",
  orange: "🍊",
  plum: "🍇",
  bell: "🔔",
  bar: "BAR",
  seven: "7",
  wild: "★",
};

export function SlotsPage() {
  const { user, setChips } = useAuth();
  const [state, setState] = useState<SlotsState>(() => startSlots(user?.chips ?? 1000));

  useEffect(() => {
    if (state.phase !== "spinning") return;
    const t = window.setTimeout(() => {
      setState((s) => {
        const next = finishSpin(s);
        if (user) void setChips(next.chips).catch(() => undefined);
        return next;
      });
    }, 1600);
    return () => window.clearTimeout(t);
  }, [state.phase, state.spinCount, user, setChips]);

  function spin() {
    setState((s) => {
      const idle = s.phase === "result" ? ackResult(s) : s;
      return beginSpin(idle);
    });
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">12 / SLOTS · Practice · Solo</p>
          <h1>Slot Machine</h1>
        </div>
        <div className="row-actions">
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => setState(resetSlots(user?.chips ?? 1000))}
          >
            RESET
          </button>
        </div>
      </div>
      <div className="game-layout">
        <div className="table table-slots">
          <div className="slots-machine">
            <div className="slots-bank">
              <span>
                Chips <b>{state.chips}</b>
              </span>
              <span>
                Bet <b>{state.bet}</b>
              </span>
              {state.lastWin > 0 ? (
                <span>
                  Won <b>{state.lastWin}</b>
                </span>
              ) : null}
            </div>

            <div className={`slots-window${state.phase === "spinning" ? " spinning" : ""}`}>
              {state.reels.map((sym, i) => (
                <div key={i} className="slots-reel" style={{ ["--delay" as string]: `${i * 0.12}s` }}>
                  <div className={`slots-symbol sym-${sym}`}>
                    <span className="slots-glyph">{GLYPH[sym]}</span>
                    <span className="slots-name">{SYMBOL_LABEL[sym]}</span>
                  </div>
                </div>
              ))}
            </div>

            <p className="slots-status">{state.message}</p>

            <div className="slots-bet-row">
              {BETS.map((b) => (
                <button
                  key={b}
                  type="button"
                  className={`btn${state.bet === b ? "" : " btn-ghost"}`}
                  disabled={state.phase === "spinning"}
                  onClick={() => setState((s) => setBet(s, b))}
                >
                  {b}
                </button>
              ))}
            </div>

            <div className="row-actions" style={{ justifyContent: "center" }}>
              <button
                className="btn"
                type="button"
                disabled={state.phase === "spinning" || state.chips < state.bet}
                onClick={spin}
              >
                Spin
              </button>
            </div>

            <div className="slots-paytable">
              <h3>Paytable</h3>
              <ul>
                {PAYTABLE.map((row) => (
                  <li key={row.note}>
                    <span>{row.note}</span>
                    <b>×{row.mult}</b>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <aside className="side">
          <div>
            <h3>Solo practice</h3>
            <p>
              Three-reel one-line slots vs the house. Logged-in chips sync after each spin; guests use a local stack.
            </p>
          </div>
          <GameRules game="slots" />
        </aside>
      </div>
    </div>
  );
}
