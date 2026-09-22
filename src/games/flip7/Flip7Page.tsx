import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  aiDecide,
  aiTarget,
  applyFlipAction,
  areaScore,
  activePlayers,
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

  const burst = state?.burst ?? null;
  const [fx, setFx] = useState<{ id: string; boom: boolean; spin: boolean } | null>(null);
  const savePlaying = Boolean(burst?.kind === "save" && fx && fx.id === burst.id && (fx.boom || fx.spin));

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!burst) return;
    const id = burst.id;
    setFx({ id, boom: true, spin: false });
    const timers: number[] = [];
    if (burst.kind === "save") {
      timers.push(window.setTimeout(() => setFx({ id, boom: true, spin: true }), 360));
      timers.push(window.setTimeout(() => setFx({ id, boom: false, spin: true }), 720));
      timers.push(window.setTimeout(() => setFx(null), 1480));
    } else {
      timers.push(window.setTimeout(() => setFx(null), 1000));
    }
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [burst?.id, burst?.kind]);

  useEffect(() => {
    if (!practice || !local || local.phase === "over") return;
    const actor = currentFlip(local);
    if (actor.human) return;
    let stop = false;
    void (async () => {
      await wait(local.burst?.kind === "save" ? 1550 : 700);
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
              blurb="Hit or stay. Freeze and Flip Three can target any active player, including you. Second Chance saves one duplicate bust — it cannot block Freeze."
              game="flip7"
              onPractice={() => setLocal(startFlip7())}
            />
          ) : (
            <>
              <div className="seat">
                {burst?.playerId === rival.id && fx?.id === burst.id && fx.boom ? <FlipBoom key={`${burst.id}-boom`} /> : null}
                {burst?.playerId === rival.id && burst.kind === "save" && burst.saveCard && fx?.id === burst.id && fx.spin ? (
                  <div className="flip-chance-hero" key={`${burst.id}-chance`}>
                    <FlipFace card={burst.saveCard} />
                  </div>
                ) : null}
                <div className="seat-label">
                  {rival.name} · {rival.total} PTS · {rival.status.toUpperCase()}
                  {rival.area.some((c) => c.kind === "chance") ? " · 2ND CHANCE" : ""}
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
                    : savePlaying
                      ? "Second Chance!"
                      : myTurn
                      ? state.phase === "target"
                        ? `Choose who gets ${state.pendingAction === "freeze" ? "Freeze" : "Flip Three"} — yourself included.`
                        : me.pendingFlip3 > 0
                          ? `Flip Three: ${me.pendingFlip3} flip${me.pendingFlip3 === 1 ? "" : "s"} left.`
                          : "Flip one card, then the next player. Stay to bank this round."
                      : `${cur?.name} is acting`}
                </div>
                <div className="target-slot">
                  {myTurn && state.phase === "target" && !savePlaying
                    ? activePlayers(state).map((p) => (
                        <button key={p.id} className="btn" type="button" onClick={() => act({ type: "target", targetId: p.id })}>
                          {p.id === me.id ? `Use on yourself` : `Use on ${p.name}`}
                        </button>
                      ))
                    : null}
                </div>
              </div>
              <div className="seat">
                {burst?.playerId === me.id && fx?.id === burst.id && fx.boom ? <FlipBoom key={`${burst.id}-boom`} /> : null}
                {burst?.playerId === me.id && burst.kind === "save" && burst.saveCard && fx?.id === burst.id && fx.spin ? (
                  <div className="flip-chance-hero" key={`${burst.id}-chance`}>
                    <FlipFace card={burst.saveCard} />
                  </div>
                ) : null}
                <div className="seat-label">
                  {me.name} · round {areaScore(me.area).score} · total {me.total}
                  {me.area.some((c) => c.kind === "chance") ? " · 2ND CHANCE" : ""}
                </div>
                <div className="pcards">
                  {me.area.map((c) => (
                    <FlipFace key={c.id} card={c} />
                  ))}
                </div>
                <div className="row-actions">
                  <button
                    className="btn btn-go"
                    type="button"
                    disabled={!myTurn || state.phase !== "action" || savePlaying}
                    onClick={() => act({ type: "hit" })}
                  >
                    HIT
                  </button>
                  <button
                    className="btn btn-gold"
                    type="button"
                    disabled={!myTurn || state.phase !== "action" || savePlaying || me.pendingFlip3 > 0}
                    onClick={() => act({ type: "stay" })}
                  >
                    STAY
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <InvitePanel game="flip7" />
      </div>
    </div>
  );
}

function FlipBoom() {
  return (
    <div className="flip-boom" aria-hidden>
      <span className="flip-boom-spark" />
      <span className="flip-boom-spark" />
      <span className="flip-boom-spark" />
      <span className="flip-boom-spark" />
      <span className="flip-boom-spark" />
      <span className="flip-boom-spark" />
      <svg className="flip-boom-cloud" viewBox="0 0 240 240">
        <path
          fill="#1a120c"
          d="M118 18l18 38 42-20-8 44 46 6-38 28 34 36-48-4-10 46-30-38-40 28 8-48-46-8 42-26-28-42 48 10z"
        />
        <path
          fill="#ff7a18"
          d="M120 34l14 32 36-16-6 36 38 6-32 22 28 30-40-2-8 38-26-32-34 22 8-40-38-8 36-22-24-34 40 8z"
        />
        <path
          fill="#ffd23a"
          d="M122 52l10 26 28-12-4 28 30 4-26 18 22 24-32-2-6 30-20-26-26 16 6-32-30-6 28-18-18-28 32 6z"
        />
        <ellipse cx="86" cy="128" rx="34" ry="28" fill="#fff4c8" />
        <ellipse cx="154" cy="122" rx="30" ry="26" fill="#ffe9a0" />
        <ellipse cx="120" cy="150" rx="36" ry="24" fill="#f4d27a" />
        <ellipse cx="70" cy="96" rx="18" ry="14" fill="#2b2118" opacity="0.85" />
        <ellipse cx="176" cy="88" rx="16" ry="13" fill="#2b2118" opacity="0.8" />
        <text
          x="120"
          y="138"
          textAnchor="middle"
          fill="#1a120c"
          fontFamily="Nunito,Arial Black,sans-serif"
          fontWeight="900"
          fontSize="36"
          letterSpacing="2"
        >
          BOOM
        </text>
      </svg>
    </div>
  );
}
