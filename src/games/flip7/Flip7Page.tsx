import { Link } from "react-router-dom";
import { currentFlip, areaScore, type FlipState } from "./engine";
import { DeckStack, FlipFace } from "../../components/PlayingCard";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { InvitePanel } from "../../components/InvitePanel";

export function Flip7Page() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "flip7" ? lobby.room : null;
  const state = (room?.view as FlipState | undefined) ?? null;
  const youId = user?.id;
  const me = state ? state.players.find((p) => p.id === youId) ?? currentFlip(state) : null;
  const rival = state && me ? state.players.find((p) => p.id !== me.id) : null;
  const cur = state ? currentFlip(state) : null;
  const myTurn = Boolean(state && me && cur?.id === me.id && state.phase !== "over");

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">02 / FLIP7 · 双人对战</p>
          <h1>七翻天</h1>
        </div>
        <div className="row-actions">
          <Link className="btn btn-ghost" to="/">
            LEAVE
          </Link>
        </div>
      </div>
      <div className="game-layout">
        <div className="table table-flip">
          {!state || !me || !rival ? (
            <div className="coda-deal">
              <p className="kicker">DUEL</p>
              <h2>邀请一名在线玩家</h2>
              <p>两人轮流翻牌，先到 200 分。右侧选择对手。</p>
            </div>
          ) : (
            <>
              <div className="seat">
                <div className="seat-label">
                  {rival.name} · {rival.total} PTS · {rival.status.toUpperCase()}
                  {cur?.id === rival.id ? " · TURN" : ""}
                </div>
                <div className="pcards">
                  {rival.area.map((c) => (
                    <FlipFace key={c.id} card={c} />
                  ))}
                </div>
              </div>
              <div className="center-well">
                <DeckStack count={state.deck.length} />
                <div className="status-line">
                  {state.phase === "over"
                    ? `${state.players.find((p) => p.id === state.winnerId)?.name ?? ""} 获胜`
                    : myTurn
                      ? state.phase === "target"
                        ? "指定对手：冻结或连翻三张"
                        : "Hit 或 Stay。重复数字即爆。"
                      : `${cur?.name} 行动中`}
                </div>
                {myTurn && state.phase === "target"
                  ? state.players
                      .filter((p) => p.id !== me.id)
                      .map((p) => (
                        <button key={p.id} className="btn" type="button" onClick={() => void lobby.sendAction({ type: "target", targetId: p.id })}>
                          对 {p.name} 使用
                        </button>
                      ))
                  : null}
              </div>
              <div className="seat">
                <div className="seat-label">
                  {me.name} · 本轮 {areaScore(me.area).score} · 累计 {me.total}
                </div>
                <div className="pcards">
                  {me.area.map((c) => (
                    <FlipFace key={c.id} card={c} />
                  ))}
                </div>
                {myTurn && state.phase === "action" && (
                  <div className="row-actions">
                    <button className="btn btn-go" type="button" onClick={() => void lobby.sendAction({ type: "hit" })}>
                      HIT
                    </button>
                    <button className="btn btn-gold" type="button" disabled={me.pendingFlip3 > 0} onClick={() => void lobby.sendAction({ type: "stay" })}>
                      STAY
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <InvitePanel game="flip7" />
      </div>
    </div>
  );
}
