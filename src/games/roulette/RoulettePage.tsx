import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  WHEEL_ORDER,
  beginSpin,
  clearBets,
  finishSpin,
  labelBet,
  nextRound,
  placeBet,
  pocketColor,
  resetStack,
  setChipSize,
  sixlineFromLow,
  startRoulette,
  streetOf,
  totalStake,
  undoBet,
  cornerFromLow,
  type BetKind,
  type RouletteState,
} from "./engine";
import { RulesButton } from "../../components/GameRules";
import { SeatTalk } from "../../components/TableTalk";
import { useAuth } from "../../context/AuthContext";

const CHIP_SIZES = [1, 5, 10, 25, 50, 100];

type InsideMode = "straight" | "split" | "street" | "corner" | "sixline";

export function RoulettePage() {
  const { user, setChips } = useAuth();
  const [state, setState] = useState<RouletteState>(() => startRoulette(user?.chips ?? 1000));
  const [mode, setMode] = useState<InsideMode>("straight");
  const [splitPick, setSplitPick] = useState<number | null>(null);

  useEffect(() => {
    if (state.phase !== "spinning") return;
    const t = window.setTimeout(() => {
      setState((s) => {
        const next = finishSpin(s);
        if (user) void setChips(next.chips).catch(() => undefined);
        return next;
      });
    }, 4200);
    return () => window.clearTimeout(t);
  }, [state.phase, user, setChips]);

  const wheelStyle = useMemo(
    () =>
      ({
        ["--wheel-deg" as string]: `${state.wheelDeg}deg`,
        background: conicWheel(),
      }) as CSSProperties,
    [state.wheelDeg],
  );

  function onNumber(n: number) {
    if (state.phase !== "bet") return;
    if (mode === "straight") {
      setState((s) => placeBet(s, "straight", { numbers: [n] }));
      return;
    }
    if (mode === "street") {
      const st = n === 0 ? null : streetOf(n);
      if (!st) {
        setState((s) => ({ ...s, message: "Street is for 1–36 rows." }));
        return;
      }
      setState((s) => placeBet(s, "street", { numbers: st }));
      return;
    }
    if (mode === "sixline") {
      const st = n === 0 ? null : streetOf(n);
      if (!st) return;
      const lo = st[0]! <= 31 ? st[0]! : null;
      const six = lo != null ? sixlineFromLow(lo) : null;
      if (!six) {
        setState((s) => ({ ...s, message: "No six-line from the last street." }));
        return;
      }
      setState((s) => placeBet(s, "sixline", { numbers: six }));
      return;
    }
    if (mode === "corner") {
      const c = n === 0 ? null : cornerFromLow(n);
      if (!c) {
        setState((s) => ({ ...s, message: "Corner: click the lower-left number of a 2×2." }));
        return;
      }
      setState((s) => placeBet(s, "corner", { numbers: c }));
      return;
    }
    if (mode === "split") {
      if (splitPick === null) {
        setSplitPick(n);
        setState((s) => ({ ...s, message: `Split: now pick a neighbor of ${n}.` }));
        return;
      }
      setState((s) => placeBet(s, "split", { numbers: [splitPick, n] }));
      setSplitPick(null);
    }
  }

  function outside(kind: BetKind, index?: 1 | 2 | 3) {
    setState((s) => placeBet(s, kind, { index }));
  }

  function spin() {
    setSplitPick(null);
    setState((s) => beginSpin(s));
  }

  function fresh() {
    const chips = user?.chips ?? 1000;
    setSplitPick(null);
    setState(resetStack(state, chips));
  }

  const streets = Array.from({ length: 12 }, (_, i) => [3 * i + 1, 3 * i + 2, 3 * i + 3] as const);

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">11 / ROULETTE · European · Solo</p>
          <h1>European Roulette</h1>
        </div>
        <div className="row-actions">
          <RulesButton game="roulette">
            <h3>Solo casino</h3>
            <p>
              Practice against the house on a European single-zero wheel. Logged-in chips sync after each spin; guests
              use a local stack.
            </p>
          </RulesButton>
          <button className="btn btn-ghost" type="button" onClick={fresh}>
            RESET
          </button>
        </div>
      </div>
      <div className="game-layout">
        <div className="table table-roulette">
          <div className="roulette-casino">
            <div className="roulette-wheel-wrap">
              <div className="roulette-pointer" aria-hidden />
              <div
                className={`roulette-wheel${state.phase === "spinning" ? " spinning" : ""}`}
                style={wheelStyle}
                aria-label="European roulette wheel"
              >
                <div className="roulette-wheel-labels">
                  {WHEEL_ORDER.map((n, i) => (
                    <span
                      key={n}
                      className={`rw-lab tone-${pocketColor(n)}`}
                      style={{ ["--i" as string]: i }}
                    >
                      {n}
                    </span>
                  ))}
                </div>
                <span className="roulette-hub" />
              </div>
              <div className="roulette-result-pill">
                {state.result != null && state.phase !== "spinning" ? (
                  <span className={`tone-${pocketColor(state.result)}`}>{state.result}</span>
                ) : (
                  <span>—</span>
                )}
              </div>
              <p className="roulette-status">{state.message}</p>
              {state.history.length ? (
                <p className="roulette-history">
                  Recent:{" "}
                  {state.history.map((n, i) => (
                    <span key={`${n}-${i}`} className={`tone-${pocketColor(n)}`}>
                      {n}
                    </span>
                  ))}
                </p>
              ) : null}
            </div>

            <div className="roulette-board-wrap">
              <div className="roulette-bank">
                <SeatTalk playerId={user?.id || "you"} name={user?.login || user?.name || user?.email || "YOU"} />
                <span>
                  Chips <b>{state.chips}</b>
                </span>
                <span>
                  Stake <b>{totalStake(state)}</b>
                </span>
                {state.lastWin > 0 ? (
                  <span>
                    Won <b>{state.lastWin}</b>
                  </span>
                ) : null}
              </div>

              <div className="roulette-chip-row">
                {CHIP_SIZES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`btn${state.chipSize === c ? "" : " btn-ghost"}`}
                    disabled={state.phase !== "bet"}
                    onClick={() => setState((s) => setChipSize(s, c))}
                  >
                    {c}
                  </button>
                ))}
              </div>

              <div className="roulette-mode-row">
                {(
                  [
                    ["straight", "Straight 35:1"],
                    ["split", "Split 17:1"],
                    ["street", "Street 11:1"],
                    ["corner", "Corner 8:1"],
                    ["sixline", "Six 5:1"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    className={`btn btn-ghost${mode === m ? " on" : ""}`}
                    disabled={state.phase !== "bet"}
                    onClick={() => {
                      setMode(m);
                      setSplitPick(null);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="roulette-felt" role="grid" aria-label="Betting board">
                <button
                  type="button"
                  className="rb-zero tone-green"
                  disabled={state.phase !== "bet"}
                  onClick={() => onNumber(0)}
                >
                  0
                </button>
                <div className="rb-grid">
                  {streets.map((row) => (
                    <div key={row[0]} className="rb-street">
                      {[row[2], row[1], row[0]].map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`rb-num tone-${pocketColor(n)}`}
                          disabled={state.phase !== "bet"}
                          onClick={() => onNumber(n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                <div className="rb-columns">
                  {([3, 2, 1] as const).map((col) => (
                    <button
                      key={col}
                      type="button"
                      className="rb-out"
                      disabled={state.phase !== "bet"}
                      onClick={() => outside("column", col)}
                    >
                      2:1
                    </button>
                  ))}
                </div>
                <div className="rb-dozens">
                  {([1, 2, 3] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      className="rb-out"
                      disabled={state.phase !== "bet"}
                      onClick={() => outside("dozen", d)}
                    >
                      {d === 1 ? "1st 12" : d === 2 ? "2nd 12" : "3rd 12"}
                    </button>
                  ))}
                </div>
                <div className="rb-even">
                  <button type="button" className="rb-out" disabled={state.phase !== "bet"} onClick={() => outside("low")}>
                    1–18
                  </button>
                  <button type="button" className="rb-out" disabled={state.phase !== "bet"} onClick={() => outside("even")}>
                    Even
                  </button>
                  <button
                    type="button"
                    className="rb-out tone-red"
                    disabled={state.phase !== "bet"}
                    onClick={() => outside("red")}
                  >
                    Red
                  </button>
                  <button
                    type="button"
                    className="rb-out tone-black"
                    disabled={state.phase !== "bet"}
                    onClick={() => outside("black")}
                  >
                    Black
                  </button>
                  <button type="button" className="rb-out" disabled={state.phase !== "bet"} onClick={() => outside("odd")}>
                    Odd
                  </button>
                  <button type="button" className="rb-out" disabled={state.phase !== "bet"} onClick={() => outside("high")}>
                    19–36
                  </button>
                </div>
              </div>

              <ul className="roulette-bet-list">
                {state.bets.length === 0 ? <li>No bets yet.</li> : null}
                {state.bets.map((b) => (
                  <li key={b.id}>
                    {b.stake} · {labelBet(b)}
                  </li>
                ))}
              </ul>

              <div className="row-actions" style={{ justifyContent: "center", flexWrap: "wrap" }}>
                {state.phase === "bet" ? (
                  <>
                    <button className="btn btn-ghost" type="button" onClick={() => setState((s) => undoBet(s))}>
                      Undo
                    </button>
                    <button className="btn btn-ghost" type="button" onClick={() => setState((s) => clearBets(s))}>
                      Clear
                    </button>
                    <button className="btn" type="button" onClick={spin} disabled={!state.bets.length}>
                      Spin
                    </button>
                  </>
                ) : null}
                {state.phase === "result" ? (
                  <button className="btn" type="button" onClick={() => setState((s) => nextRound(s))}>
                    Next round
                  </button>
                ) : null}
                {state.phase === "spinning" ? <p>Spinning…</p> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function conicWheel(): string {
  const slice = 100 / WHEEL_ORDER.length;
  const parts = WHEEL_ORDER.map((n, i) => {
    const c = pocketColor(n);
    const color = c === "green" ? "#0f7a3a" : c === "red" ? "#b91c1c" : "#1a1a1a";
    const a = (i * slice).toFixed(4);
    const b = ((i + 1) * slice).toFixed(4);
    return `${color} ${a}% ${b}%`;
  });
  return `conic-gradient(from ${-180 / WHEEL_ORDER.length}deg, ${parts.join(", ")})`;
}
