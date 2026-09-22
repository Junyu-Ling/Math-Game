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
  type FlipPlayer,
  type FlipState,
} from "./engine";
import { DeckStack, FlipFace } from "../../components/PlayingCard";
import { FitCards, SideCard } from "../../components/FitCards";
import { InvitePanel } from "../../components/InvitePanel";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { wait } from "../../lib/shuffle";

function aroundYou<T extends { id: string }>(players: T[], youId: string) {
  const i = Math.max(0, players.findIndex((p) => p.id === youId));
  const n = players.length;
  const at = (d: number) => players[(i + d) % n] ?? null;
  if (n <= 1) return { rival: null as T | null, left: null as T | null, right: null as T | null, partner: null as T | null };
  if (n === 2) return { rival: at(1), left: null as T | null, right: null as T | null, partner: null as T | null };
  if (n === 3) return { rival: null as T | null, left: at(1), partner: null as T | null, right: at(2) };
  return { rival: null as T | null, left: at(1), partner: at(2), right: at(3) };
}

function FlipSeat({
  player,
  className,
  vertical,
  turn,
  burst,
  fx,
  mine,
}: {
  player: FlipPlayer;
  className: string;
  vertical?: boolean;
  turn: boolean;
  burst: FlipState["burst"];
  fx: { id: string; boom: boolean; spin: boolean } | null;
  mine?: boolean;
}) {
  return (
    <div className={`seat ${className}${vertical ? " seat-side" : ""}`}>
      {burst?.playerId === player.id && fx?.id === burst.id && fx.boom ? <FlipBoom key={`${burst.id}-boom`} /> : null}
      {burst?.playerId === player.id && burst.kind === "save" && burst.saveCard && fx?.id === burst.id && fx.spin ? (
        <div className="flip-chance-hero" key={`${burst.id}-chance`}>
          <FlipFace card={burst.saveCard} />
        </div>
      ) : null}
      <div className="seat-label">
        {player.name} · {mine ? `round ${areaScore(player.area).score} · total ${player.total}` : `${player.total} PTS · ${player.status.toUpperCase()}`}
        {player.area.some((c) => c.kind === "chance") ? " · 2ND CHANCE" : ""}
        {turn ? " · TURN" : ""}
      </div>
      <FitCards vertical={vertical}>
        {player.area.map((c) => {
          const face = <FlipFace key={c.id} card={c} />;
          return vertical ? <SideCard key={c.id}>{face}</SideCard> : face;
        })}
      </FitCards>
    </div>
  );
}

export function Flip7Page() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "flip7" ? lobby.room : null;
  const [local, setLocal] = useState<FlipState | null>(null);
  const [seats, setSeats] = useState(1);
  const state = (room?.view as FlipState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const youId = practice ? "you" : user?.id;
  const waiting = Boolean(state && state.phase === "lobby");
  const me = state ? state.players.find((p) => p.id === youId) ?? (waiting ? state.players[0] : currentFlip(state)) : null;
  const seated = state && me ? aroundYou(state.players, me.id) : null;
  const cur = state && state.phase !== "lobby" ? currentFlip(state) : null;
  const myTurn = Boolean(state && me && cur?.id === me.id && state.phase !== "over" && state.phase !== "lobby");
  const host = Boolean(me && state?.players[0]?.id === me.id);

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
    if (!practice || !local || local.phase === "over" || local.phase === "lobby") return;
    const actor = currentFlip(local);
    if (actor.human) return;
    let stop = false;
    void (async () => {
      await wait(local.burst?.kind === "save" ? 1550 : 700);
      if (stop) return;
      setLocal((s) => {
        if (!s || s.phase === "lobby" || currentFlip(s).human) return s;
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
    setLocal((s) => {
      if (!s || !me) return s;
      const id = action.type === "start" ? me.id : currentFlip(s).id;
      return applyFlipAction(s, id, action);
    });
  }

  const playing = Boolean(state && me && !waiting);
  const multi = Boolean(playing && state && state.players.length > 2);
  const solo = Boolean(playing && state && state.players.length === 1);

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">02 / FLIP7 · 1–4</p>
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
        <div className={`table table-flip ${multi ? "flip-multi" : ""} ${solo ? "flip-solo" : ""}`}>
          {!playing || !state || !me || !seated ? (
            <div className="coda-deal">
              <p className="kicker">{waiting ? "TABLE" : "FLIP 7"}</p>
              <h2>{waiting ? `Table ${state?.players.length ?? 0}/4` : "First to 200"}</h2>
              <p>
                {waiting
                  ? "1–4 players. Host starts the round when everyone is seated."
                  : "Hit or stay. Freeze and Flip Three can target any active player, including you. Practice solo or with CPUs."}
              </p>
              {waiting && state ? (
                <ul className="lobby-roster">
                  {state.players.map((p, i) => (
                    <li key={p.id}>
                      <b>{p.name}</b>
                      <span>{i === 0 ? "host" : "seated"}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {!waiting ? (
                <div className="deal-seats" role="group" aria-label="Players">
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} className={`btn ${seats === n ? "" : "btn-ghost"}`} type="button" onClick={() => setSeats(n)}>
                      {n}P
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="row-actions" style={{ justifyContent: "center" }}>
                {waiting ? (
                  host && (state?.players.length ?? 0) >= 1 ? (
                    <button className="btn" type="button" onClick={() => act({ type: "start" })}>
                      Start {state?.players.length}P
                    </button>
                  ) : (
                    <p>Waiting for the host to start.</p>
                  )
                ) : (
                  <button className="btn" type="button" onClick={() => setLocal(startFlip7(seats))}>
                    {seats === 1 ? "Practice solo" : "Practice vs CPU"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {seated.partner ? (
                <FlipSeat player={seated.partner} className="seat-partner" turn={cur?.id === seated.partner.id} burst={burst} fx={fx} />
              ) : null}
              {seated.rival ? (
                <FlipSeat player={seated.rival} className="seat-rival" turn={cur?.id === seated.rival.id} burst={burst} fx={fx} />
              ) : null}
              {seated.left ? (
                <FlipSeat player={seated.left} className="seat-left" vertical turn={cur?.id === seated.left.id} burst={burst} fx={fx} />
              ) : null}
              <div className="center-well">
                <div className="flip-center-row">
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
              {seated.right ? (
                <FlipSeat player={seated.right} className="seat-right" vertical turn={cur?.id === seated.right.id} burst={burst} fx={fx} />
              ) : null}
              <div className="seat seat-you">
                <FlipSeat player={me} className="seat-you-inner" turn={myTurn} burst={burst} fx={fx} mine />
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
