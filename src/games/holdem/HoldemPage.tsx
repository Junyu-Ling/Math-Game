import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  applyHoldemAction,
  holdemBotAct,
  startHoldemPractice,
  type HoldemAction,
  type HoldemState,
} from "./engine";
import { PokerFace } from "../../components/PlayingCard";
import { GameSetup } from "../../components/GameSetup";
import { LobbyDecor } from "../../components/LobbyDecor";
import { InvitePanel } from "../../components/InvitePanel";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { wait } from "../../lib/shuffle";

export function HoldemPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "holdem" ? lobby.room : null;
  const [local, setLocal] = useState<HoldemState | null>(null);
  const state = (room?.view as HoldemState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const youId = practice ? "you" : user?.id;
  const me = state?.players.find((p) => p.id === youId);
  const rival = state?.players.find((p) => p.id !== youId);
  const myTurn = Boolean(state && me && state.players[state.turn]?.id === me.id && state.street !== "showdown" && state.street !== "over");
  const toCall = me && state ? Math.max(0, state.currentBet - me.bet) : 0;

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!practice || !local || local.street === "over") return;
    const actor = local.players[local.turn];
    if (local.street === "showdown") return;
    if (!actor || actor.id === "you") return;
    let stop = false;
    void (async () => {
      await wait(700);
      if (stop) return;
      setLocal((s) => {
        if (!s || s.players[s.turn]?.id !== "cpu") return s;
        try {
          return applyHoldemAction(s, "cpu", holdemBotAct(s, "cpu"));
        } catch {
          try {
            return applyHoldemAction(s, "cpu", { type: "call" });
          } catch {
            try {
              return applyHoldemAction(s, "cpu", { type: "check" });
            } catch {
              return applyHoldemAction(s, "cpu", { type: "fold" });
            }
          }
        }
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: HoldemAction) {
    try {
      if (room) {
        void lobby.sendAction(action).catch((e) => alert(e instanceof Error ? e.message : e));
        return;
      }
      setLocal((s) => (s ? applyHoldemAction(s, "you", action) : s));
    } catch (e) {
      alert(e instanceof Error ? e.message : e);
    }
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">05 / HOLD · Duel</p>
          <h1>Texas Hold’em</h1>
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
            <>
            <LobbyDecor game="holdem" />
            <GameSetup
              kicker="HOLD’EM"
              title="Heads-up Texas Hold’em"
              blurb="Standard 52-card deck. Blinds 5 / 10. First to take the other’s chips."
              game="holdem"
              onPractice={() => setLocal(startHoldemPractice())}
            />
            </>
          ) : (
            <>
              <div className="seat">
                <div className="seat-label">
                  {rival.name} · {rival.chips}
                  {rival.folded ? " · folded" : ""}
                  {state.players[state.turn]?.id === rival.id ? " · TURN" : ""}
                </div>
                <div className="pcards">
                  {rival.hole.map((c) => (
                    <PokerFace
                      key={c.id}
                      card={practice && state.street !== "showdown" && state.street !== "over" ? { ...c, hidden: true } : c}
                    />
                  ))}
                </div>
              </div>
              <div className="center-well">
                <div className="pcards community-slots">
                  {Array.from({ length: 5 }, (_, i) => {
                    const card = state.community[i];
                    return card ? <PokerFace key={card.id} card={card} /> : <div key={`slot-${i}`} className="card-ghost" aria-hidden />;
                  })}
                </div>
                <p className="status-line">
                  Pot {state.pot} · {state.message}
                </p>
              </div>
              <div className="seat">
                <div className="seat-label">
                  {me.name} · {me.chips}
                  {myTurn ? " · TURN" : ""}
                </div>
                <div className="pcards">
                  {me.hole.map((c) => (
                    <PokerFace key={c.id} card={c} />
                  ))}
                </div>
                <div className="row-actions">
                  {state.street === "showdown" ? (
                    <button className="btn" type="button" onClick={() => act({ type: "next" })}>
                      Next hand
                    </button>
                  ) : (
                    <>
                      <button className="btn btn-ghost" type="button" disabled={!myTurn} onClick={() => act({ type: "fold" })}>
                        Fold
                      </button>
                      {toCall > 0 ? (
                        <button className="btn" type="button" disabled={!myTurn} onClick={() => act({ type: "call" })}>
                          Call {toCall}
                        </button>
                      ) : (
                        <button className="btn" type="button" disabled={!myTurn} onClick={() => act({ type: "check" })}>
                          Check
                        </button>
                      )}
                      <button
                        className="btn"
                        type="button"
                        disabled={!myTurn}
                        onClick={() =>
                          act({ type: "raise", amount: state.currentBet + Math.max(state.bb * 2, Math.floor(state.pot / 2) || state.bb) })
                        }
                      >
                        Raise
                      </button>
                      <button className="btn btn-ghost" type="button" disabled={!myTurn} onClick={() => act({ type: "allin" })}>
                        All in
                      </button>
                    </>
                  )}
                </div>
                {state.street === "over" ? <p className="result-note">{state.message}</p> : null}
              </div>
            </>
          )}
        </div>
        <InvitePanel game="holdem" />
      </div>
    </div>
  );
}
