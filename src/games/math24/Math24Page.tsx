import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { InvitePanel } from "../../components/InvitePanel";
import type { M24DuelState } from "./engine";

const OPS = ["+", "-", "×", "÷", "(", ")"];

export function Math24Page() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "m24" ? lobby.room : null;
  const state = (room?.view as M24DuelState | undefined) ?? null;
  const [used, setUsed] = useState<boolean[]>([false, false, false, false]);
  const [expr, setExpr] = useState("");
  const youId = user?.id;
  const myScore = youId && state ? state.scores[youId] || 0 : 0;
  const rival = state?.players.find((p) => p.id !== youId);

  useEffect(() => {
    setUsed([false, false, false, false]);
    setExpr("");
  }, [state?.round]);

  function tapNum(i: number) {
    if (!state || used[i]) return;
    const n = state.nums[i];
    if (n === undefined) return;
    setExpr((e) => e + String(n));
    setUsed((u) => u.map((v, k) => (k === i ? true : v)));
  }

  async function submit() {
    await lobby.sendAction({ type: "submit", expr });
    setExpr("");
    setUsed([false, false, false, false]);
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">04 / M24 · 双人对战 · {state ? `${myScore} : ${rival && youId ? state.scores[rival.id] || 0 : 0}` : "0 : 0"}</p>
          <h1>二十四点</h1>
        </div>
        <div className="row-actions">
          <Link className="btn btn-ghost" to="/">
            LEAVE
          </Link>
        </div>
      </div>
      <div className="game-layout">
        <div className="table table-m24">
          {!state ? (
            <div className="coda-deal">
              <p className="kicker">DUEL</p>
              <h2>邀请一名在线玩家</h2>
              <p>同一组四张牌，谁先凑出 24 得分，先到 3 分获胜。</p>
            </div>
          ) : (
            <>
              <div className="m24-board">
                {state.nums.map((n, i) => (
                  <button
                    key={`${n}-${i}-${state.round}`}
                    className={`m24-num ${used[i] ? "used" : ""}`}
                    type="button"
                    disabled={state.phase === "over"}
                    onClick={() => tapNum(i)}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="expr">{expr || "—"}</div>
              <div className="ops">
                {OPS.map((op) => (
                  <button key={op} type="button" onClick={() => setExpr((e) => e + op)}>
                    {op}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setExpr("");
                    setUsed([false, false, false, false]);
                  }}
                >
                  CLR
                </button>
                <button type="button" onClick={() => setExpr((e) => e.slice(0, -1))}>
                  DEL
                </button>
              </div>
              <div className="row-actions" style={{ justifyContent: "center", marginTop: 24 }}>
                <button className="btn" type="button" disabled={state.phase === "over"} onClick={() => void submit()}>
                  SUBMIT
                </button>
              </div>
              <p className="msg" style={{ textAlign: "center" }}>
                {state.message}
              </p>
            </>
          )}
        </div>
        <InvitePanel game="m24" />
      </div>
    </div>
  );
}
