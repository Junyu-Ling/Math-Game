import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  applyUnoAction,
  aiUno,
  canPlay,
  currentUno,
  legalCards,
  needsUnoCall,
  startUnoPractice,
  topCard,
  type UnoAction,
  type UnoPlayer,
  type UnoState,
} from "./engine";
import { DeckStack, UnoColorPick, UnoFace } from "../../components/PlayingCard";
import { InvitePanel } from "../../components/InvitePanel";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { wait } from "../../lib/shuffle";

function aroundYou<T extends { id: string }>(players: T[], youId: string) {
  const i = Math.max(0, players.findIndex((p) => p.id === youId));
  const n = players.length;
  const at = (d: number) => players[(i + d) % n] ?? null;
  if (n <= 2) return { rival: at(1), left: null as T | null, right: null as T | null, partner: null as T | null };
  if (n === 3) return { rival: null as T | null, left: at(1), partner: null as T | null, right: at(2) };
  return { rival: null as T | null, left: at(1), partner: at(2), right: at(3) };
}

function ServiceBell({
  rung,
  armed,
  mine,
  onRing,
}: {
  rung: boolean;
  armed: boolean;
  mine: boolean;
  onRing?: () => void;
}) {
  return (
    <button
      className={`uno-bell ${rung ? "rung" : ""} ${armed ? "armed" : ""}`}
      type="button"
      disabled={!mine || rung || !armed}
      onClick={onRing}
      aria-label={rung ? "UNO called" : "Ring for UNO"}
    >
      <svg viewBox="0 0 120 108" aria-hidden>
        <ellipse cx="60" cy="94" rx="46" ry="10" fill="#1a1a1a" />
        <path
          d="M16 86c2-42 24-62 44-62s42 20 44 62"
          fill="#d8dce2"
          stroke="#8d939b"
          strokeWidth="1.4"
        />
        <ellipse cx="60" cy="86" rx="44" ry="8" fill="#111" />
        <circle cx="60" cy="24" r="11" fill="#d5d8de" stroke="#8d939b" strokeWidth="1.2" />
        <circle cx="60" cy="20" r="6.5" fill="#f4f5f7" />
        <ellipse cx="44" cy="52" rx="10" ry="16" fill="#fff" opacity="0.28" />
      </svg>
      <span>UNO</span>
    </button>
  );
}

function UnoSeat({
  player,
  className,
  hidden,
  turn,
  mine,
  playable,
  onPlay,
  onRing,
}: {
  player: UnoPlayer;
  className: string;
  hidden: boolean;
  turn: boolean;
  mine: boolean;
  playable?: (id: string) => boolean;
  onPlay?: (id: string) => void;
  onRing?: () => void;
}) {
  const armed = needsUnoCall(player);
  return (
    <div className={`seat ${className}`}>
      <div className="seat-label">
        {player.name} · {player.hand.length} cards{turn ? " · TURN" : ""}
        {player.calledUno ? " · UNO" : ""}
      </div>
      <div className="uno-seat-row">
        <ServiceBell rung={player.calledUno} armed={armed} mine={mine} onRing={onRing} />
        <div className="pcards">
          {player.hand.map((c) => (
            <UnoFace
              key={c.id}
              card={hidden ? { ...c, hidden: true } : c}
              playable={Boolean(mine && playable?.(c.id))}
              onClick={mine && onPlay ? () => onPlay(c.id) : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function UnoPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "uno" ? lobby.room : null;
  const [local, setLocal] = useState<UnoState | null>(null);
  const [seats, setSeats] = useState(2);
  const [plusFx, setPlusFx] = useState<{ n: number; key: string } | null>(null);
  const state = (room?.view as UnoState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const youId = practice ? "you" : user?.id;
  const waiting = Boolean(state && state.phase === "lobby");
  const me = state ? state.players.find((p) => p.id === youId) ?? (waiting ? state.players[0] : currentUno(state)) : null;
  const cur = state && state.phase !== "lobby" ? currentUno(state) : null;
  const myTurn = Boolean(state && me && cur?.id === me.id && state.phase !== "over" && state.phase !== "lobby");
  const host = Boolean(me && state?.players[0]?.id === me.id);
  const seated = state && me ? aroundYou(state.players, me.id) : null;
  const top = state ? topCard(state) : undefined;
  const shoutArmed = Boolean(me && state && state.phase === "play" && needsUnoCall(me));
  const drewPlayable = Boolean(myTurn && state?.phase === "play" && state.justDrawnId);
  const canDraw = Boolean(myTurn && state?.phase === "play" && !state.justDrawnId);

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    const burst = state?.drawBurst;
    if (!burst) return;
    setPlusFx({ n: burst.n, key: burst.key });
    const t = window.setTimeout(() => setPlusFx((cur) => (cur?.key === burst.key ? null : cur)), 1400);
    return () => window.clearTimeout(t);
  }, [state?.drawBurst?.key, state?.drawBurst?.n]);

  useEffect(() => {
    if (!practice || !local || local.phase === "over" || local.phase === "lobby") return;
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

  const playing = Boolean(state && me && !waiting && state.players.length >= 2);
  const multi = Boolean(playing && state && state.players.length > 2);

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">05 / UNO · 2–4</p>
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
        <div className={`table table-uno ${multi ? "uno-multi" : ""}`}>
          {!playing || !state || !me || !seated ? (
            <div className="coda-deal">
              <p className="kicker">{waiting ? "TABLE" : "UNO"}</p>
              <h2>{waiting ? `Table ${state?.players.length ?? 0}/4` : "Empty your hand"}</h2>
              <p>
                {waiting
                  ? "2–4 players. Host starts the deal when everyone is seated."
                  : "Match color, number, or action. Ring the bell before you go down to one card. Miss it and draw two."}
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
                  {[2, 3, 4].map((n) => (
                    <button key={n} className={`btn ${seats === n ? "" : "btn-ghost"}`} type="button" onClick={() => setSeats(n)}>
                      {n}P
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="row-actions" style={{ justifyContent: "center" }}>
                {waiting ? (
                  host && (state?.players.length ?? 0) >= 2 ? (
                    <button className="btn" type="button" onClick={() => act({ type: "start" })}>
                      Start {state?.players.length}P
                    </button>
                  ) : (
                    <p>Waiting for the host to start.</p>
                  )
                ) : (
                  <button className="btn" type="button" onClick={() => setLocal(startUnoPractice(seats))}>
                    Practice vs CPU
                  </button>
                )}
              </div>
            </div>
          ) : (
            <>
              {seated.partner ? (
                <UnoSeat
                  player={seated.partner}
                  className="seat-partner"
                  hidden
                  turn={cur?.id === seated.partner.id}
                  mine={false}
                />
              ) : null}
              {seated.rival ? (
                <UnoSeat
                  player={seated.rival}
                  className="seat-rival"
                  hidden={practice}
                  turn={cur?.id === seated.rival.id}
                  mine={false}
                />
              ) : null}
              {seated.left ? (
                <UnoSeat
                  player={seated.left}
                  className="seat-left"
                  hidden
                  turn={cur?.id === seated.left.id}
                  mine={false}
                />
              ) : null}
              <div className="center-well">
                <div className="center-cards">
                  <DeckStack
                    count={state.deck.length}
                    label="Draw"
                    onClick={canDraw ? () => act({ type: "draw" }) : undefined}
                    disabled={!canDraw}
                  />
                  {top ? <UnoFace card={top} /> : <div className="card-ghost" aria-hidden />}
                </div>
                {state.pendingDraw > 0 ? <div className="uno-plus-flag">+{state.pendingDraw}</div> : null}
                {plusFx ? <div key={plusFx.key} className="uno-plus-burst">+{plusFx.n}</div> : null}
                <div className="uno-center-actions">
                  <div className={`uno-color-chip ${state.color}`}>{state.color.toUpperCase()}</div>
                  {drewPlayable ? (
                    <button className="btn btn-ghost" type="button" onClick={() => act({ type: "keep" })}>
                      KEEP
                    </button>
                  ) : null}
                  {myTurn && state.phase === "color" ? <UnoColorPick onPick={(color) => act({ type: "color", color })} /> : null}
                </div>
                <div className="status-line">
                  {state.phase === "over"
                    ? `${state.players.find((p) => p.id === state.winnerId)?.name ?? ""} wins`
                    : state.pendingDraw > 0
                      ? `Draw +${state.pendingDraw}, or stack +2 / +4`
                      : shoutArmed && myTurn
                        ? drewPlayable
                          ? "Ring the bell to call UNO, then play or keep"
                          : "Ring the bell for UNO, then play"
                        : drewPlayable
                          ? "Play the drawn card, or keep it"
                          : myTurn
                            ? state.phase === "color"
                              ? "Pick a wild color"
                              : legalCards(state, me.id).length
                                ? "Play a matching card"
                                : "No match — draw one"
                            : `${cur?.name} is acting`}
                </div>
              </div>
              {seated.right ? (
                <UnoSeat
                  player={seated.right}
                  className="seat-right"
                  hidden
                  turn={cur?.id === seated.right.id}
                  mine={false}
                />
              ) : null}
              <UnoSeat
                player={me}
                className="seat-you"
                hidden={false}
                turn={myTurn}
                mine
                playable={(id) => {
                  const card = me.hand.find((c) => c.id === id);
                  return Boolean(myTurn && state.phase === "play" && card && canPlay(state, card));
                }}
                onPlay={(cardId) => act({ type: "play", cardId })}
                onRing={() => act({ type: "uno" })}
              />
            </>
          )}
        </div>
        <InvitePanel game="uno" />
      </div>
    </div>
  );
}
