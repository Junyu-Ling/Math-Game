import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  applyUnoAction,
  aiUno,
  canPlay,
  currentUno,
  startUnoPractice,
  topCard,
  type UnoAction,
  type UnoState,
} from "./engine";
import { DeckStack, UnoColorPick, UnoFace } from "../../components/PlayingCard";
import { GameSetup } from "../../components/GameSetup";
import { InvitePanel } from "../../components/InvitePanel";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { wait } from "../../lib/shuffle";

export function UnoPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "uno" ? lobby.room : null;
  const [local, setLocal] = useState<UnoState | null>(null);
  const state = (room?.view as UnoState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const youId = practice ? "you" : user?.id;
  const me = state ? state.players.find((p) => p.id === youId) ?? currentUno(state) : null;
  const rival = state && me ? state.players.find((p) => p.id !== me.id) : null;
  const cur = state ? currentUno(state) : null;
  const myTurn = Boolean(state && me && cur?.id === me.id && state.phase !== "over");
  const top = state ? topCard(state) : undefined;

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!practice || !local || local.phase === "over") return;
    const actor = currentUno(local);
    if (actor.human) return;
    let stop = false;
    void (async () => {
      await wait(650);
      if (stop) return;
      setLocal((s) => {
        if (!s || currentUno(s).human) return s;
        return applyUnoAction(s, currentUno(s).id, aiUno(s));
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: UnoAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    setLocal((s) => {
      if (!s || !me) return s;
      return applyUnoAction(s, me.id, action);
    });
  }

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">05 / UNO · Duel</p>
          <h1>UNO</h1>
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
        <div className="table table-uno">
          {!state || !me || !rival ? (
            <GameSetup
              kicker="UNO"
              title="Empty your hand"
              blurb="Match color, number, or action. In a duel, reverse equals skip."
              game="uno"
              onPractice={() => setLocal(startUnoPractice())}
            />
          ) : (
            <>
              <div className="seat">
                <div className="seat-label">
                  {rival.name} · {rival.hand.length} cards{cur?.id === rival.id ? " · TURN" : ""}
                </div>
                <div className="pcards">
                  {rival.hand.map((c) => (
                    <UnoFace key={c.id} card={practice ? { ...c, hidden: true } : c} />
                  ))}
                </div>
              </div>
              <div className="center-well">
                <DeckStack count={state.deck.length} label="Draw" onClick={myTurn && state.phase === "play" ? () => act({ type: "draw" }) : undefined} />
                {top ? <UnoFace card={top} /> : null}
                <div className={`uno-color-chip ${state.color}`}>{state.color.toUpperCase()}</div>
                <div className="status-line">
                  {state.phase === "over"
                    ? `${state.players.find((p) => p.id === state.winnerId)?.name ?? ""} wins`
                    : state.pendingDraw > 0
                      ? `Draw ${state.pendingDraw}, or stack +2 / +4`
                      : myTurn
                        ? state.phase === "color"
                          ? "Pick a wild color"
                          : "Play or draw"
                        : `${cur?.name} is acting`}
                </div>
                {myTurn && state.phase === "color" ? <UnoColorPick onPick={(color) => act({ type: "color", color })} /> : null}
              </div>
              <div className="seat">
                <div className="seat-label">
                  {me.name} · {me.hand.length} cards{myTurn ? " · TURN" : ""}
                </div>
                <div className="pcards">
                  {me.hand.map((c) => (
                    <UnoFace
                      key={c.id}
                      card={c}
                      playable={myTurn && state.phase === "play" && canPlay(state, c)}
                      onClick={() => act({ type: "play", cardId: c.id })}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
        <InvitePanel game="uno" />
      </div>
    </div>
  );
}
