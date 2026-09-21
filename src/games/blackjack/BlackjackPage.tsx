import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { InvitePanel } from "../../components/InvitePanel";
import { PokerFace } from "../../components/PlayingCard";
import { hardSoft, type BjDuelState } from "./engine";

export function BlackjackPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "bj" ? lobby.room : null;
  const state = (room?.view as BjDuelState | undefined) ?? null;
  const youId = user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const rival = state?.players.find((p) => p.id !== youId);
  const myTurn = Boolean(state && me && state.players[state.turn]?.id === me.id && state.phase === "play");

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">03 / BJ21 · 双人对战</p>
          <h1>二十一点</h1>
        </div>
        <div className="row-actions">
          <Link className="btn btn-ghost" to="/">
            LEAVE
          </Link>
        </div>
      </div>
      <div className="game-layout">
        <div className="table table-bj">
          {!state || !me || !rival ? (
            <div className="coda-deal">
              <p className="kicker">DUEL</p>
              <h2>邀请一名在线玩家</h2>
              <p>两人比点数，不超过 21。未停牌前对手底牌不可见。</p>
            </div>
          ) : (
            <>
              <div className="seat">
                <div className="seat-label">
                  {rival.name} · {rival.stood || state.phase === "over" ? hardSoft(rival.cards).total : "—"}
                  {state.players[state.turn]?.id === rival.id ? " · TURN" : ""}
                </div>
                <div className="pcards">
                  {rival.cards.map((c) => (
                    <PokerFace key={c.id} card={c} />
                  ))}
                </div>
              </div>
              <div className="center-well">
                <p className="status-line">{state.message}</p>
              </div>
              <div className="seat">
                <div className="seat-label">
                  {me.name} · {hardSoft(me.cards).total}
                  {myTurn ? " · TURN" : ""}
                </div>
                <div className="pcards">
                  {me.cards.map((c) => (
                    <PokerFace key={c.id} card={c} />
                  ))}
                </div>
                {myTurn && (
                  <div className="row-actions">
                    <button className="btn btn-go" type="button" onClick={() => void lobby.sendAction({ type: "hit" })}>
                      HIT
                    </button>
                    <button className="btn btn-gold" type="button" onClick={() => void lobby.sendAction({ type: "stand" })}>
                      STAND
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <InvitePanel game="bj" />
      </div>
    </div>
  );
}
