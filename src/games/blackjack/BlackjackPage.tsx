import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { aiBjAction, applyBjDuelAction, hardSoft, startBjPractice, type BjDuelAction, type BjDuelState } from "./engine";
import { PokerFace } from "../../components/PlayingCard";
import { GameSetup } from "../../components/GameSetup";
import { InvitePanel } from "../../components/InvitePanel";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { wait } from "../../lib/shuffle";

export function BlackjackPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "bj" ? lobby.room : null;
  const [local, setLocal] = useState<BjDuelState | null>(null);
  const state = (room?.view as BjDuelState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const rival = state?.players.find((p) => p.id !== youId);
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
      await wait(700);
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
          {practice ? (
            <button className="btn btn-ghost" type="button" onClick={() => setLocal(null)}>
              RESET
            </button>
          ) : null}
          <Link className="btn btn-ghost" to="/">
            LEAVE
          </Link>
        </div>
      </div>
      <div className="game-layout">
        <div className="table table-bj">
          {!state || !me || !rival ? (
            <GameSetup
              kicker="BLACKJACK"
              title="Closest without going over 21"
              blurb="The rival hole card stays hidden until they stand."
              game="bj"
              onPractice={() => setLocal(startBjPractice())}
            />
          ) : (
            <>
              <div className="seat">
                <div className="seat-label">
                  {rival.name} · {rival.stood || state.phase === "over" ? hardSoft(rival.cards).total : "—"}
                  {state.players[state.turn]?.id === rival.id ? " · TURN" : ""}
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
        <InvitePanel game="bj" />
      </div>
    </div>
  );
}
