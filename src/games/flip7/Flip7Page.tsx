import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  aiDecide,
  aiTarget,
  applyTarget,
  areaScore,
  currentFlip,
  hit,
  startFlip7,
  stay,
  type FlipState,
} from "./engine";
import { wait } from "../../lib/shuffle";
import { DeckStack, FlipFace } from "../../components/PlayingCard";

export function Flip7Page() {
  const [state, setState] = useState<FlipState>(() => startFlip7());
  const me = currentFlip(state);
  const humanTurn = me.human && state.phase !== "over";
  const mine = state.players[0]!;
  const mineScore = areaScore(mine.area);

  useEffect(() => {
    if (me.human || state.phase === "over") return;
    let stop = false;
    (async () => {
      await wait(700);
      if (stop) return;
      if (state.phase === "target") {
        setState((s) => applyTarget(s, aiTarget(s)));
        return;
      }
      if (state.phase === "action") {
        const d = aiDecide(state);
        setState((s) => (d === "hit" ? hit(s) : stay(s)));
      }
    })();
    return () => {
      stop = true;
    };
  }, [state.phase, state.turn, state.log.length, me.human]);

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">02 / FLIP7 · ROUND {state.round}</p>
          <h1>七翻天</h1>
        </div>
        <div className="row-actions">
          <button className="btn btn-ghost" type="button" onClick={() => setState(startFlip7())}>
            RESET
          </button>
          <Link className="btn btn-ghost" to="/">
            LEAVE
          </Link>
        </div>
      </div>
      <div className="game-layout">
        <div className="table table-flip">
          {state.players
            .filter((p) => !p.human)
            .map((p) => (
              <div className="seat" key={p.id}>
                <div className="seat-label">
                  {p.name} · {p.total} PTS · {p.status.toUpperCase()}
                  {p.pendingFreeze ? " · FROZEN" : ""}
                  {p.pendingFlip3 ? ` · FLIP×${p.pendingFlip3}` : ""}
                  {currentFlip(state).id === p.id ? " · TURN" : ""}
                </div>
                <div className="pcards">
                  {p.area.map((c) => (
                    <FlipFace key={c.id} card={c} />
                  ))}
                </div>
              </div>
            ))}

          <div className="center-well">
            <DeckStack count={state.deck.length} />
            <div className="status-line">
              {state.phase === "over"
                ? `${state.players.find((p) => p.id === state.winnerId)?.name ?? ""} 先到 ${state.goal}`
                : humanTurn
                  ? state.phase === "target"
                    ? `指定一名对手：${state.pendingAction === "freeze" ? "冻结其下回合" : "下回合连翻三张"}`
                    : me.pendingFlip3 > 0
                      ? `必须再翻 ${me.pendingFlip3} 张`
                      : "Hit 或 Stay。重复数字即爆。"
                  : `${me.name} 行动中`}
            </div>
          </div>

          <div className="seat">
            <div className="seat-label">
              YOU · 本轮 {mineScore.score}
              {mineScore.flip7 ? " · FLIP7" : ""} · 累计 {mine.total}
            </div>
            <div className="pcards">
              {mine.area.map((c) => (
                <FlipFace key={c.id} card={c} />
              ))}
            </div>
            {humanTurn && state.phase === "action" && (
              <div className="row-actions">
                <button className="btn btn-go" type="button" onClick={() => setState((s) => hit(s))}>
                  HIT
                </button>
                <button
                  className="btn btn-gold"
                  type="button"
                  disabled={me.pendingFlip3 > 0}
                  onClick={() => setState((s) => stay(s))}
                >
                  STAY
                </button>
              </div>
            )}
            {humanTurn && state.phase === "target" && (
              <div className="row-actions">
                {state.players
                  .filter((p) => !p.human)
                  .map((p) => (
                    <button key={p.id} className="btn btn-ghost" type="button" onClick={() => setState((s) => applyTarget(s, p.id))}>
                      {p.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>
        <aside className="side">
          <div>
            <h3>SCORE → {state.goal}</h3>
            <div className="scoreboard">
              {state.players.map((p) => (
                <div key={p.id} className={`score-row ${p.total >= Math.max(...state.players.map((x) => x.total)) ? "lead" : ""}`}>
                  <span>{p.name}</span>
                  <span>{p.total}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3>HEURISTIC</h3>
            <p>经验停牌线：本轮约 22–23 分、或已有 5–6 张不同数字时，优先 Stay。功能牌优先打领先者。</p>
          </div>
          <div>
            <h3>RULE</h3>
            <ul>
              <li>数字 1–12，面值几就有几张。</li>
              <li>重复数字爆牌，本轮 0 分。</li>
              <li>7 张不同数字：总分 +15，强制结束回合。</li>
              <li>Second Chance 可免一次爆牌。</li>
              <li>Freeze / Flip Three 指定对手。</li>
            </ul>
          </div>
          <div>
            <h3>LOG</h3>
            <div className="log">
              {[...state.log].reverse().map((l) => (
                <div key={l.id} className={l.tone}>
                  {l.text}
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
