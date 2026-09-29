import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  aiHalli,
  applyHalliAction,
  currentHalli,
  fruitTotals,
  HALLI_EMOJI,
  HALLI_FRUITS,
  HALLI_LABEL,
  ringingFruit,
  startHalliPractice,
  topOpen,
  type HalliAction,
  type HalliCard,
  type HalliFruit,
  type HalliPlayer,
  type HalliState,
} from "./engine";
import { InvitePanel } from "../../components/InvitePanel";
import { MixedCpuBar, seatTag } from "../../components/MixedCpuBar";
import { LobbyDecor } from "../../components/LobbyDecor";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

function aroundYou<T extends { id: string }>(players: T[], youId: string) {
  const i = Math.max(0, players.findIndex((p) => p.id === youId));
  const n = players.length;
  const at = (d: number) => players[(i + d) % n] ?? null;
  if (n <= 2) return { rival: at(1), left: null as T | null, right: null as T | null, partner: null as T | null };
  if (n === 3) return { rival: null as T | null, left: at(1), partner: null as T | null, right: at(2) };
  return { rival: null as T | null, left: at(1), partner: at(2), right: at(3) };
}

function FruitCard({ card, dim }: { card: HalliCard; dim?: boolean }) {
  return (
    <div className={`hg-card fruit-${card.fruit}${dim ? " dim" : ""}`} aria-label={`${card.count} ${card.fruit}`}>
      <div className="hg-card-inner">
        {Array.from({ length: card.count }, (_, i) => (
          <span key={i} className="hg-fruit">
            {HALLI_EMOJI[card.fruit]}
          </span>
        ))}
      </div>
    </div>
  );
}

function HalliSeat({
  player,
  className,
  turn,
  mine,
}: {
  player: HalliPlayer;
  className: string;
  turn: boolean;
  mine?: boolean;
}) {
  const top = topOpen(player);
  return (
    <div className={`seat ${className}`}>
      <div className="seat-label">
        {player.name} · deck {player.deck.length} · score {player.score}
        {player.out ? " · OUT" : turn ? " · TURN" : ""}
        {mine ? " · YOU" : ""}
      </div>
      <div className="hg-seat-row">
        <div className="hg-deck-back" aria-hidden>
          <b>{player.deck.length}</b>
        </div>
        {top ? <FruitCard card={top} /> : <div className="hg-card ghost" aria-hidden />}
      </div>
    </div>
  );
}

function TotalsBar({ totals, hot }: { totals: Record<HalliFruit, number>; hot: HalliFruit | null }) {
  return (
    <div className="hg-totals">
      {HALLI_FRUITS.map((f) => (
        <div key={f} className={`hg-total${hot === f ? " hot" : ""}`}>
          <span>{HALLI_EMOJI[f]}</span>
          <b>{totals[f]}</b>
          <em>{HALLI_LABEL[f]}</em>
        </div>
      ))}
    </div>
  );
}

export function HalliGalliPage() {
  const { user } = useAuth();
  const lobby = useLobby();
  const room = lobby.room?.game === "halli" ? lobby.room : null;
  const [local, setLocal] = useState<HalliState | null>(null);
  const [seats, setSeats] = useState(2);
  const state = (room?.view as HalliState | undefined) ?? local;
  const practice = Boolean(local && !room);
  const youId = practice ? "you" : user?.id;
  const waiting = Boolean(state && state.phase === "lobby");
  const me = state ? state.players.find((p) => p.id === youId) ?? (waiting ? state.players[0] : null) : null;
  const cur = state && state.phase === "play" ? currentHalli(state) : null;
  const myTurn = Boolean(me && cur?.id === me.id);
  const host = Boolean(me && state?.players[0]?.id === me.id);
  const seated = state && me ? aroundYou(state.players, me.id) : null;
  const hot = state && state.phase === "play" ? ringingFruit(state) : null;
  const totals = state ? fruitTotals(state) : null;

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  useEffect(() => {
    if (!practice || !local || local.phase !== "play") return;
    const actor = currentHalli(local);
    if (actor.human) return;
    let stop = false;
    void (async () => {
      await wait(hot ? 380 : CPU_THINK_MS);
      if (stop) return;
      setLocal((s) => {
        if (!s || s.phase !== "play") return s;
        const cpu = currentHalli(s);
        if (cpu.human) return s;
        return applyHalliAction(s, cpu.id, aiHalli(s));
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local, hot]);

  // Any human or CPU can ring when five show; CPU rings from the effect above on its turn.
  // Also let CPU ring immediately when five appear even if not their flip turn.
  useEffect(() => {
    if (!practice || !local || local.phase !== "play" || !hot) return;
    const cpu = local.players.find((p) => !p.human && !p.out);
    if (!cpu) return;
    let stop = false;
    void (async () => {
      await wait(420);
      if (stop) return;
      setLocal((s) => {
        if (!s || s.phase !== "play" || !ringingFruit(s)) return s;
        if (s.lastRing?.ok) return s;
        return applyHalliAction(s, cpu.id, { type: "ring" });
      });
    })();
    return () => {
      stop = true;
    };
  }, [practice, local?.lastRing?.key, hot, local?.phase]);

  function act(action: HalliAction) {
    if (room) {
      void lobby.sendAction(action);
      return;
    }
    if (!me) return;
    setLocal((s) => (s ? applyHalliAction(s, me.id, action) : s));
  }

  const playing = Boolean(state && me && !waiting && state.players.length >= 2);
  const multi = Boolean(playing && state && state.players.length > 2);

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">07 / HALLI GALLI · 2–4</p>
          <h1>Halli Galli</h1>
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
        <div className={`table table-hg ${multi ? "hg-multi" : ""}`}>
          {!playing || !state || !me || !seated ? (
            <>
              <LobbyDecor game="halli" />
              <div className="coda-deal">
                <p className="kicker">{waiting ? "TABLE" : "HALLI GALLI"}</p>
                <h2>{waiting ? `Table ${state?.players.length ?? 0}/4` : "Ring on five"}</h2>
                <p>
                  {waiting
                    ? "2–4 players. Mix humans and CPUs. Host starts when at least two are seated."
                    : "Flip fruit cards. When the open tops add up to five of one fruit, ring the bell first."}
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
                {!waiting ? (
                  <div className="deal-seats" role="group" aria-label="Players">
                    {[2, 3, 4].map((n) => (
                      <button key={n} className={`btn ${seats === n ? "" : "btn-ghost"}`} type="button" onClick={() => setSeats(n)}>
                        {n}P
                      </button>
                    ))}
                  </div>
                ) : null}
                <MixedCpuBar game="halli" />
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
                    <button className="btn" type="button" onClick={() => setLocal(startHalliPractice(seats))}>
                      Practice vs CPU
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              {seated.partner ? (
                <HalliSeat player={seated.partner} className="seat-partner" turn={cur?.id === seated.partner.id} />
              ) : null}
              {seated.rival ? <HalliSeat player={seated.rival} className="seat-rival" turn={cur?.id === seated.rival.id} /> : null}
              {seated.left ? <HalliSeat player={seated.left} className="seat-left" turn={cur?.id === seated.left.id} /> : null}
              <div className="center-well">
                {totals ? <TotalsBar totals={totals} hot={hot} /> : null}
                <button
                  className={`hg-bell${hot ? " armed" : ""}${state.lastRing ? (state.lastRing.ok ? " ok" : " bad") : ""}`}
                  type="button"
                  onClick={() => act({ type: "ring" })}
                  disabled={state.phase !== "play" || Boolean(me.out)}
                  aria-label="Ring the Halli Galli bell"
                >
                  <svg viewBox="0 0 96 108" aria-hidden>
                    <ellipse cx="48" cy="98" rx="30" ry="5" fill="#000" opacity="0.18" />
                    <path d="M18 86c1.2-40 14.5-62 30-62s28.8 22 30 62" fill="#d8dde3" stroke="#6f767f" strokeWidth="1.1" />
                    <path d="M28 42c6-14 14-20 20-20 7 0 15 7 20 20" fill="#fff" opacity="0.34" />
                    <ellipse cx="48" cy="86" rx="32" ry="8" fill="#1a1a1a" />
                    <rect x="45.2" y="16" width="5.6" height="14" rx="2.4" fill="#b8c0c6" />
                    <circle cx="48" cy="16" r="9.2" fill="#e8ebef" stroke="#6f767f" strokeWidth="1" />
                  </svg>
                  <b>RING</b>
                </button>
                <div className="status-line">
                  {state.phase === "over"
                    ? `${state.players.find((p) => p.id === state.winnerId)?.name ?? ""} wins`
                    : hot
                      ? `Five ${HALLI_LABEL[hot].toLowerCase()} — ring now!`
                      : myTurn
                        ? "Your flip"
                        : `${cur?.name ?? ""} is flipping…`}
                </div>
                <div className="row-actions" style={{ justifyContent: "center" }}>
                  <button className="btn" type="button" disabled={!myTurn || state.phase !== "play"} onClick={() => act({ type: "flip" })}>
                    Flip
                  </button>
                </div>
              </div>
              {seated.right ? <HalliSeat player={seated.right} className="seat-right" turn={cur?.id === seated.right.id} /> : null}
              <HalliSeat player={me} className="seat-you" turn={myTurn} mine />
            </>
          )}
        </div>
        <div className="side-stack">
          <InvitePanel game="halli" />
          <aside className="side">
            <div>
              <h3>LOG</h3>
              <div className="log">
                {playing && state
                  ? [...state.log].reverse().map((l) => (
                      <div key={l.id}>{l.text}</div>
                    ))
                  : null}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
