import { useEffect, useState } from "react";
import {
  aiBjAction,
  applyBjDuelAction,
  hardSoft,
  startBjPractice,
  type BjDuelAction,
  type BjDuelState,
} from "./engine";
import { PokerFace } from "../../components/PlayingCard";
import { LobbyDecor } from "../../components/LobbyDecor";
import { RulesButton } from "../../components/GameRules";
import { MixedCpuBar, seatTag } from "../../components/MixedCpuBar";
import { SeatTalk } from "../../components/TableTalk";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

export function BlackjackPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "bj" ? lobby.room : null;
  const [local, setLocal] = useState<BjDuelState | null>(null);
  const held = (!room && lobby.settlement?.game === "bj" ? lobby.settlement.view : null) as BjDuelState | null;
  const state = (room?.view as BjDuelState | undefined) ?? held ?? local;
  const practice = Boolean(local && !room && !held);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const rival = state?.players.find((p) => p.id !== youId);
  const waiting = Boolean(state?.phase === "lobby");
  const host = Boolean(user && room?.seats?.[0] === user.id);
  const myTurn = Boolean(state && me && state.players[state.turn]?.id === me.id && state.phase === "play");

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!practice || !local || local.phase === "over") return;
    const actor = local.players[local.turn];
    if (!actor || actor.id === "you") return;
    let stop = false;
    void (async () => {
      await wait(CPU_THINK_MS);
      if (stop) return;
      setLocal((s) => (s && s.players[s.turn]?.id === "cpu" ? applyBjDuelAction(s, "cpu", aiBjAction(s)) : s));
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: BjDuelAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => (s ? applyBjDuelAction(s, "you", action) : s));
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">03 / BJ21 · Duel</p>
          <h1>Blackjack</h1>
        </div>
        <div className="row-actions">
          <RulesButton game="bj" />
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
                    : "Practice vs CPU, or open a table to invite. Rival hole card stays hidden until they stand."}
                </p>
                {waiting && state ? (
                  <ul className="lobby-roster">
                    {state.players.map((p, i) => (
                      <li key={p.id}>
                        <SeatTalk playerId={p.id} name={p.name} />
                        <span>{seatTag(p, i, state.players[0]?.id)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <MixedCpuBar game="bj" onPractice={() => setLocal(startBjPractice())} />
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
                  <SeatTalk playerId={rival.id} name={rival.name}>
                    <span>
                  {rival.stood || state.phase === "over" ? hardSoft(rival.cards).total : "-"}
                  {state.players[state.turn]?.id === rival.id ? " · TURN" : ""}
                    </span>
                  </SeatTalk>
                </div>
                <div className="pcards">
                  {rival.cards.map((c, i) => (
                    <PokerFace
                      key={c.id}
                      card={practice && !rival.stood && state.phase !== "over" && i > 0 ? { ...c, hidden: true } : c}
                    />
                  ))}
                </div>
              </div>
              <div className="center-well">
                <p className="status-line">{state.message}</p>
              </div>
              <div className="seat seat-you">
                <div className="seat-label">
                  <SeatTalk playerId={me.id} name={me.name}>
                    <span>
                  {hardSoft(me.cards).total}
                  {myTurn ? " · TURN" : ""}
                    </span>
                  </SeatTalk>
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
      </div>
    </div>
  );
}
