import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { PokerFace } from "../../components/PlayingCard";
import {
  deal,
  doubleDown,
  hardSoft,
  hit,
  nextRound,
  split,
  stand,
  startBj,
  type BjState,
} from "./engine";

export function BlackjackPage() {
  const { user, setChips } = useAuth();
  const [state, setState] = useState<BjState>(() => startBj(user?.chips ?? 1000));
  const lastChips = useRef(state.chips);

  useEffect(() => {
    if (user && state.phase === "bet") {
      lastChips.current = user.chips;
      setState((s) => ({ ...s, chips: user.chips }));
    }
    // 只在账号切换时同步余额，避免对局中被覆盖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (user && state.chips !== lastChips.current && state.phase === "settle") {
      lastChips.current = state.chips;
      void setChips(state.chips);
    }
  }, [state.chips, state.phase, setChips, user]);

  function apply(fn: (s: BjState) => BjState) {
    setState((s) => fn(s));
  }

  const hand = state.hands[state.active];
  const playerTotal = hand ? hardSoft(hand.cards).total : 0;
  const dealerShown = hardSoft(state.dealer).total;

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">03 / BJ21</p>
          <h1>二十一点</h1>
        </div>
        <div className="row-actions">
          <span className="chip-pill">{state.chips} CHIPS</span>
          <Link className="btn btn-ghost" to="/">
            LEAVE
          </Link>
        </div>
      </div>
      <div className="game-layout">
        <div className="table table-bj">
          <div className="seat">
            <div className="seat-label">DEALER · {state.phase === "bet" ? "—" : dealerShown}</div>
            <div className="pcards">
              {state.dealer.map((c) => (
                <PokerFace key={c.id} card={c} />
              ))}
            </div>
          </div>
          <div className="center-well">
            <p className="status-line">{state.message}</p>
          </div>
          <div className="seat">
            {state.hands.length === 0 ? (
              <>
                <div className="seat-label">BET</div>
                <div className="bet-row">
                  {[10, 25, 50, 100].map((n) => (
                    <button key={n} className="chip" type="button" onClick={() => setState((s) => ({ ...s, bet: n }))}>
                      {n}
                    </button>
                  ))}
                  <span className="chip-pill">NOW {state.bet}</span>
                  <button className="btn" type="button" onClick={() => apply(deal)}>
                    DEAL
                  </button>
                </div>
              </>
            ) : (
              state.hands.map((h, i) => (
                <div key={i} style={{ opacity: i === state.active || state.phase !== "player" ? 1 : 0.45 }}>
                  <div className="seat-label">
                    HAND {i + 1} · {hardSoft(h.cards).total}
                    {h.stood ? " · STAND" : ""} · BET {h.bet}
                  </div>
                  <div className="pcards">
                    {h.cards.map((c) => (
                      <PokerFace key={c.id} card={c} />
                    ))}
                  </div>
                </div>
              ))
            )}
            {state.phase === "player" && (
              <div className="row-actions">
                <button className="btn btn-go" type="button" onClick={() => apply(hit)}>
                  HIT
                </button>
                <button className="btn btn-gold" type="button" onClick={() => apply(stand)}>
                  STAND
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => apply(doubleDown)}>
                  DOUBLE
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => apply(split)}>
                  SPLIT
                </button>
              </div>
            )}
            {state.phase === "settle" && (
              <div className="row-actions">
                <button className="btn" type="button" onClick={() => apply(nextRound)}>
                  NEXT
                </button>
              </div>
            )}
            {state.phase === "player" && <p className="section-note">PLAYER {playerTotal}</p>}
          </div>
        </div>
        <aside className="side">
          <div>
            <h3>RULE</h3>
            <ul>
              <li>A 为 1 或 11。JQK = 10。</li>
              <li>Blackjack 赔 3:2。</li>
              <li>庄家少于 17 必须要牌，17 起停。</li>
              <li>爆牌即输。平局退注。</li>
              <li>起手对子可分；前两张可加倍。</li>
            </ul>
          </div>
          <div>
            <h3>ACCOUNT</h3>
            <p>{user ? "结算后写入该邮箱的筹码。" : "游客模式，刷新会重置为 1000。登录可继承余额。"}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
