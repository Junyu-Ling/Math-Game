import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  applyGuandanAction,
  guandanBotAct,
  partnerIndex,
  startGuandanPractice,
  teamOf,
  type GuandanAction,
  type GuandanState,
} from "./engine";
import { PokerFace } from "../../components/PlayingCard";
import { GameSetup } from "../../components/GameSetup";
import { InvitePanel } from "../../components/InvitePanel";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { wait } from "../../lib/shuffle";
import type { PokerCard } from "../../lib/poker";

function BackFan({ n, side }: { n: number; side?: "left" | "right" | "top" }) {
  const show = Math.min(side === "top" ? 9 : 3, Math.max(0, n));
  return (
    <div className={`ddz-fan ${side ?? "top"}`}>
      {Array.from({ length: show }, (_, i) => (
        <PokerFace key={i} card={{ id: `bk${side ?? "t"}${i}`, suit: "S", rank: "A", hidden: true }} />
      ))}
      <b className="ddz-count">{n}</b>
    </div>
  );
}

function SeatTag({
  name,
  extra,
  turn,
  out,
}: {
  name: string;
  extra?: string;
  turn: boolean;
  out: boolean;
}) {
  return (
    <div className={`ddz-tag ${turn ? "turn" : ""} ${out ? "out" : ""}`}>
      <span className="ddz-avatar">{name.slice(0, 1)}</span>
      <div>
        <strong>{name}</strong>
        <small>
          {out ? "Out" : extra}
          {turn ? " · turn" : ""}
        </small>
      </div>
    </div>
  );
}

function SeatBlock({
  className,
  tag,
  children,
}: {
  className: string;
  tag: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={`ddz-seat ${className}`}>
      {tag}
      {children}
    </div>
  );
}

export function GuandanPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "guandan" ? lobby.room : null;
  const [local, setLocal] = useState<GuandanState | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const state = (room?.view as GuandanState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const youId = practice ? "you" : user?.id;
  const waiting = Boolean(state && state.phase === "lobby");
  const me = state?.players.find((p) => p.id === youId);
  const myI = state && youId ? state.players.findIndex((p) => p.id === youId) : -1;
  const myTurn = Boolean(
    state && state.phase === "play" && me && state.players[state.turn]?.id === me.id && !state.finishers.includes(me.id),
  );

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    setPicked([]);
  }, [state?.turn, state?.last?.cards.length, state?.message]);

  useEffect(() => {
    if (!practice || !local || local.phase !== "play") return;
    const actor = local.players[local.turn];
    if (!actor || !actor.id.startsWith("cpu")) return;
    let stop = false;
    void (async () => {
      await wait(local.last || !local.jumpCard ? 550 : 1400);
      if (stop) return;
      setLocal((s) => {
        const id = s?.players[s.turn]?.id;
        if (!s || !id?.startsWith("cpu")) return s;
        try {
          return applyGuandanAction(s, id, guandanBotAct(s, id));
        } catch {
          try {
            return applyGuandanAction(s, id, { type: "pass" });
          } catch {
            return s;
          }
        }
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local]);

  function act(action: GuandanAction) {
    if (room) {
      void lobby.sendAction(action).catch((e) => alert(e instanceof Error ? e.message : e));
      return;
    }
    try {
      setLocal((s) => (s ? applyGuandanAction(s, "you", action) : s));
    } catch (e) {
      alert(e instanceof Error ? e.message : e);
    }
  }

  function toggle(card: PokerCard) {
    setPicked((ids) => (ids.includes(card.id) ? ids.filter((id) => id !== card.id) : [...ids, card.id]));
  }

  const left = myI >= 0 && state ? state.players[(myI + 1) % 4] : null;
  const partner = myI >= 0 && state ? state.players[partnerIndex(myI)] : null;
  const right = myI >= 0 && state ? state.players[(myI + 3) % 4] : null;
  const playing = Boolean(state && me && state.phase !== "lobby" && state.players.length === 4);

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">06 / GDAN · Four players</p>
          <h1>Guandan</h1>
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
        <div className="table table-gd">
          {!state || waiting || !playing ? (
            <div className="coda-deal">
              {waiting && state ? (
                <p className="kicker">
                  Table {state.players.length}/4 · {state.players.map((p) => p.name).join(" · ")}
                </p>
              ) : null}
              <GameSetup
                kicker="GUANDAN"
                title="Four players. Partners sit across."
                blurb="Two decks plus jokers, 27 cards each. Invite three online players. The table deals when all four seats are filled. Practice puts you with three CPUs."
                game="guandan"
                onPractice={() => setLocal(startGuandanPractice())}
              />
            </div>
          ) : me && left && partner && right ? (
            <>
              <SeatBlock
                className="ddz-partner"
                tag={
                  <SeatTag
                    name={partner.name}
                    extra={`Partner · ${partner.hand.length}`}
                    turn={state.players[state.turn]?.id === partner.id}
                    out={state.finishers.includes(partner.id)}
                  />
                }
              >
                <BackFan n={partner.hand.length} side="top" />
              </SeatBlock>
              <SeatBlock
                className="ddz-left"
                tag={
                  <SeatTag
                    name={left.name}
                    extra={`Left · ${left.hand.length}`}
                    turn={state.players[state.turn]?.id === left.id}
                    out={state.finishers.includes(left.id)}
                  />
                }
              >
                <BackFan n={left.hand.length} side="left" />
              </SeatBlock>
              <div className="ddz-trick">
                {!state.last && state.jumpCard ? (
                  <>
                    <p className="kicker">Jump card</p>
                    <div className="ddz-trick-cards ddz-jump">
                      <PokerFace card={state.jumpCard} />
                    </div>
                  </>
                ) : (
                  <div className="ddz-trick-cards">
                    {(state.last?.cards || []).map((c) => (
                      <PokerFace key={c.id} card={c} />
                    ))}
                  </div>
                )}
                <p className="ddz-msg">{state.message}</p>
                {myI >= 0 ? (
                  <p className="ddz-teams">
                    {state.players.filter((_, i) => teamOf(i) === teamOf(myI)).map((p) => p.name).join(" / ")}
                    {"  vs  "}
                    {state.players.filter((_, i) => teamOf(i) !== teamOf(myI)).map((p) => p.name).join(" / ")}
                  </p>
                ) : null}
              </div>
              <SeatBlock
                className="ddz-right"
                tag={
                  <SeatTag
                    name={right.name}
                    extra={`Right · ${right.hand.length}`}
                    turn={state.players[state.turn]?.id === right.id}
                    out={state.finishers.includes(right.id)}
                  />
                }
              >
                <BackFan n={right.hand.length} side="right" />
              </SeatBlock>
              <SeatBlock
                className="ddz-me"
                tag={
                  <SeatTag
                    name={me.name}
                    extra={`${me.hand.length} cards`}
                    turn={myTurn}
                    out={state.finishers.includes(me.id)}
                  />
                }
              >
                <div className="ddz-hand">
                  {me.hand.map((c) => (
                    <PokerFace key={c.id} card={c} selected={picked.includes(c.id)} onClick={() => toggle(c)} />
                  ))}
                </div>
                <div className="ddz-actions">
                  <button className="ddz-btn pass" type="button" disabled={!myTurn} onClick={() => act({ type: "pass" })}>
                    Pass
                  </button>
                  <button
                    className="ddz-btn play"
                    type="button"
                    disabled={!myTurn}
                    onClick={() => act({ type: "play", cards: me.hand.filter((c) => picked.includes(c.id)) })}
                  >
                    Play
                  </button>
                </div>
                {state.phase === "over" ? <p className="result-note">{state.message}</p> : null}
              </SeatBlock>
            </>
          ) : (
            <GameSetup
              kicker="GUANDAN"
              title="Four players. Partners sit across."
              blurb="Invite three online players. Deals at four."
              game="guandan"
              onPractice={() => setLocal(startGuandanPractice())}
            />
          )}
        </div>
        <InvitePanel game="guandan" />
      </div>
    </div>
  );
}
