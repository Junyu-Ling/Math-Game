import { useEffect, useState } from "react";
import {
  PAYTABLE,
  SYMBOLS,
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
import { RulesButton } from "../../components/GameRules";
import { useAuth } from "../../context/AuthContext";

const BETS = [1, 5, 10, 25, 50, 100];
const REEL_COUNT = 3;
const REEL_STOP_FIRST_MS = 780;
const REEL_STOP_GAP_MS = 560;
const REEL_LAND_MS = 340;

export const SLOT_GLYPH: Record<SymbolId, string> = {
  cherry: "🍒",
  lemon: "🍋",
  orange: "🍊",
  plum: "🍇",
  bell: "🔔",
  bar: "BAR",
  seven: "7",
  wild: "★",
};

/** Compact paytable face for the home-card preview. */
export function SlotGlyph({ sym }: { sym: SymbolId }) {
  return (
    <span className={`slots-symbol sym-${sym}`}>
      <span className="slots-glyph">{SLOT_GLYPH[sym]}</span>
    </span>
  );
}

function reelLoop(offset: number): SymbolId[] {
  const once = SYMBOLS.map((_, i) => SYMBOLS[(i + offset) % SYMBOLS.length]!);
  return [...once, ...once];
}

const REEL_LOOPS = [0, 3, 5].map(reelLoop);

export function SlotsPage() {
  const { user, setChips } = useAuth();
  const [state, setState] = useState<SlotsState>(() => startSlots(user?.chips ?? 1000));
  const [stopped, setStopped] = useState(REEL_COUNT);

  useEffect(() => {
    if (state.phase !== "spinning") {
      setStopped(REEL_COUNT);
      return;
    }
    setStopped(0);
    const timers = Array.from({ length: REEL_COUNT }, (_, i) =>
      window.setTimeout(() => setStopped(i + 1), REEL_STOP_FIRST_MS + i * REEL_STOP_GAP_MS),
    );
    const fin = window.setTimeout(() => {
      setState((s) => {
        if (s.phase !== "spinning") return s;
        const next = finishSpin(s);
        if (user) void setChips(next.chips).catch(() => undefined);
        return next;
      });
    }, REEL_STOP_FIRST_MS + (REEL_COUNT - 1) * REEL_STOP_GAP_MS + REEL_LAND_MS);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(fin);
    };
  }, [state.phase, state.spinCount, user, setChips]);

  function spin() {
    setStopped(0);
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
          <RulesButton game="slots">
            <h3>Solo practice</h3>
            <p>Three-reel one-line slots vs the house. Logged-in chips sync after each spin; guests use a local stack.</p>
          </RulesButton>
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

            <div
              className="slots-window"
              aria-busy={state.phase === "spinning"}
            >
              {state.reels.map((sym, i) => {
                const spinning = state.phase === "spinning" && i >= stopped;
                const landed = state.phase === "spinning" && i < stopped;
                return (
                  <div
                    key={i}
                    className={`slots-reel${spinning ? " is-spinning" : ""}${landed ? " is-landed" : ""}`}
                    style={{ ["--i" as string]: i }}
                    aria-label={spinning ? `Reel ${i + 1} spinning` : `${SYMBOL_LABEL[sym]}`}
                  >
                    {spinning ? (
                      <div className="slots-strip" aria-hidden>
                        {REEL_LOOPS[i]!.map((face, n) => (
                          <div key={n} className="slots-cell">
                            <ReelFace sym={face} />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <ReelFace sym={sym} />
                    )}
                  </div>
                );
              })}
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
      </div>
    </div>
  );
}

function ReelFace({ sym }: { sym: SymbolId }) {
  return (
    <div className={`slots-symbol sym-${sym}`}>
      <span className="slots-glyph">{SLOT_GLYPH[sym]}</span>
      <span className="slots-name">{SYMBOL_LABEL[sym]}</span>
    </div>
  );
}
