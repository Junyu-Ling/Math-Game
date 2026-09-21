import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  aiDecide,
  aiTarget,
  applyFlipAction,
  areaScore,
  currentFlip,
  startFlip7,
  type FlipAction,
  type FlipState,
} from "./engine";
import { DeckStack, FlipFace } from "../../components/PlayingCard";
import { GameSetup } from "../../components/GameSetup";
import { InvitePanel } from "../../components/InvitePanel";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { wait } from "../../lib/shuffle";

export function Flip7Page() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "flip7" ? lobby.room : null;
  const [local, setLocal] = useState<FlipState | null>(null);
  const state = (room?.view as FlipState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const youId = practice ? local?.players.find((p) => p.human)?.id : user?.id;
  const me = state ? state.players.find((p) => p.id === youId) ?? currentFlip(state) : null;
  const rival = state && me ? state.players.find((p) => p.id !== me.id) : null;
  const cur = state ? currentFlip(state) : null;
  const myTurn = Boolean(state && me && cur?.id === me.id && state.phase !== "over");

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!practice || !local || local.phase === "over") return;
    const actor = currentFlip(local);
    if (actor.human) return;
    let stop = false;
    void (async () => {
      await wait(700);
      if (stop) return;
      setLocal((s) => {
        if (!s || currentFlip(s).human) return s;
        if (s.phase === "target") return applyFlipAction(s, currentFlip(s).id, { type: "target", targetId: aiTarget(s) });
        return applyFlipAction(s, currentFlip(s).id, { type: aiDecide(s) });
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: FlipAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => (s ? applyFlipAction(s, currentFlip(s).id, action) : s));
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">02 / FLIP7 · Duel</p>
          <h1>Flip 7</h1>
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
        <div className="table table-flip">
          {!state || !me || !rival ? (
            <GameSetup
              kicker="FLIP 7"
              title="First to 200"
              blurb="Seven distinct numbers add +15. A duplicate number busts."
              game="flip7"
              onPractice={() => setLocal(startFlip7())}
            />
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
                    ? `${state.players.find((p) => p.id === state.winnerId)?.name ?? ""} wins`
                    : myTurn
                      ? state.phase === "target"
                        ? "Pick a rival: Freeze or Flip Three"
                        : "Hit or Stay. Duplicates bust."
                      : `${cur?.name} is acting`}
                </div>
                {myTurn && state.phase === "target"
                  ? state.players
                      .filter((p) => p.id !== me.id)
                      .map((p) => (
                        <button key={p.id} className="btn" type="button" onClick={() => act({ type: "target", targetId: p.id })}>
                          Use on {p.name}
                        </button>
                      ))
                  : null}
              </div>
              <div className="seat">
                <div className="seat-label">
                  {me.name} · round {areaScore(me.area).score} · total {me.total}
                </div>
                <div className="pcards">
                  {me.area.map((c) => (
                    <FlipFace key={c.id} card={c} />
                  ))}
                </div>
                {myTurn && state.phase === "action" && (
                  <div className="row-actions">
                    <button className="btn btn-go" type="button" onClick={() => act({ type: "hit" })}>
                      HIT
                    </button>
                    <button className="btn btn-gold" type="button" disabled={me.pendingFlip3 > 0} onClick={() => act({ type: "stay" })}>
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
