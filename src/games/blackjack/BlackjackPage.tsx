import { hardSoft, type BjDuelAction, type BjDuelState } from "./engine";
import { PokerFace } from "../../components/PlayingCard";
import { LobbyDecor } from "../../components/LobbyDecor";
import { InvitePanel } from "../../components/InvitePanel";
import { GameRules } from "../../components/GameRules";
import { MixedCpuBar, seatTag } from "../../components/MixedCpuBar";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";

export function BlackjackPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "bj" ? lobby.room : null;
  const state = room?.view as BjDuelState | undefined;
  const youId = user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const rival = state?.players.find((p) => p.id !== youId);
  const waiting = Boolean(state?.phase === "lobby");
  const host = Boolean(user && room?.seats?.[0] === user.id);
  const myTurn = Boolean(state && me && state.players[state.turn]?.id === me.id && state.phase === "play");

  function act(action: BjDuelAction) {
    if (room) void lobby.sendAction(action);
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">03 / BJ21 · Duel</p>
          <h1>Blackjack</h1>
        </div>
        <div className="row-actions">
          <button className="btn btn-ghost" type="button" onClick={() => void lobby.leaveHome()}>
            LEAVE
          </button>
        </div>
      </div>
      <div className="game-layout">
        <div className="table table-bj">
          {!state || !me || waiting ? (
            <>
              <LobbyDecor game="bj" />
              <div className="coda-deal">
                <p className="kicker">{waiting ? "TABLE" : "BLACKJACK"}</p>
                <h2>{waiting ? `Table ${state?.players.length ?? 0}/2` : "Closest without going over 21"}</h2>
                <p>
                  {waiting
                    ? "Add a CPU or invite one friend, then start. Rival hole card stays hidden until they stand."
                    : "Open a table, add a CPU or invite, then start."}
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
                <MixedCpuBar game="bj" />
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
            </>
          ) : !rival ? null : (
            <>
              <div className="seat">
                <div className="seat-label">
                  {rival.name} · {rival.stood || state.phase === "over" ? hardSoft(rival.cards).total : "-"}
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
                <div className="row-actions">
                  <button className="btn btn-go" type="button" disabled={!myTurn} onClick={() => act({ type: "hit" })}>
                    HIT
                  </button>
                  <button className="btn btn-gold" type="button" disabled={!myTurn} onClick={() => act({ type: "stand" })}>
                    STAND
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="side-stack">
          <InvitePanel game="bj" />
          <aside className="side">
            <GameRules game="bj" />
          </aside>
        </div>
      </div>
    </div>
  );
}
