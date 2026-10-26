import { useEffect, useState, type CSSProperties } from "react";
import {
  aiDecide,
  aiTarget,
  applyFlipAction,
  areaScore,
  activePlayers,
  currentFlip,
  cardLabel,
  liveTotal,
  startFlip7,
  startFlip7Solo,
  type FlipAction,
  type FlipDraw,
  type FlipPlayer,
  type FlipRoundRecord,
  type FlipSoloRecord,
  type FlipState,
} from "./engine";
import { DeckStack, FlipFace } from "../../components/PlayingCard";
import { FitCards, SideCard } from "../../components/FitCards";
import { ClickPop, RulesButton } from "../../components/GameRules";
import { MixedCpuBar, seatTag } from "../../components/MixedCpuBar";
import { LobbyDecor } from "../../components/LobbyDecor";
import { useAuth } from "../../context/AuthContext";
import { useLobby } from "../../context/LobbyContext";
import { forfeitText } from "../../lib/forfeit";
import { CPU_THINK_MS, wait } from "../../lib/shuffle";

function aroundYou<T extends { id: string }>(players: T[], youId: string) {
  const i = Math.max(0, players.findIndex((p) => p.id === youId));
  const n = players.length;
  const at = (d: number) => players[(i + d) % n] ?? null;
  if (n <= 1) return { rival: null as T | null, left: null as T | null, right: null as T | null, partner: null as T | null, extras: [] as T[] };
  if (n === 2) return { rival: at(1), left: null as T | null, right: null as T | null, partner: null as T | null, extras: [] as T[] };
  if (n === 3) return { rival: null as T | null, left: at(1), partner: null as T | null, right: at(2), extras: [] as T[] };
  const shown = new Set([youId, at(1)?.id, at(2)?.id, at(3)?.id].filter(Boolean));
  const extras = players.filter((p) => !shown.has(p.id));
  return { rival: null as T | null, left: at(1), partner: at(2), right: at(3), extras };
}

/** Opponents on an ellipse; bottom ~80° arc reserved for you. Angles: 0 = top, clockwise. */
function ringOpponents<T extends { id: string }>(players: T[], youId: string) {
  const i = Math.max(0, players.findIndex((p) => p.id === youId));
  const others: T[] = [];
  for (let d = 1; d < players.length; d++) others.push(players[(i + d) % players.length]!);
  const startDeg = -145;
  const endDeg = 145;
  const rx = 42;
  const ry = 36;
  return others.map((player, idx) => {
    const deg = startDeg + ((endDeg - startDeg) * (idx + 0.5)) / others.length;
    const rad = (deg * Math.PI) / 180;
    return {
      player,
      xPct: Math.sin(rad) * rx,
      yPct: -Math.cos(rad) * ry,
    };
  });
}

function FlipSeat({
  player,
  className,
  vertical,
  lockSize,
  turn,
  lead,
  burst,
  fx,
  mine,
}: {
  player: FlipPlayer;
  className: string;
  vertical?: boolean;
  lockSize?: boolean;
  turn: boolean;
  lead?: boolean;
  burst: FlipState["burst"];
  fx: { id: string; boom: boolean; spin: boolean } | null;
  mine?: boolean;
}) {
  const scored = areaScore(player.area);
  const onBurst = Boolean(burst && burst.playerId === player.id && fx?.id === burst.id);
  const showFlip7 = scored.flip7 || (onBurst && burst?.kind === "flip7");
  // Boom is only for bust (and the save intro flash) — freeze / flip7 never use it.
  const showBoom = Boolean(onBurst && fx?.boom && (burst?.kind === "bust" || burst?.kind === "save"));
  return (
    <div className={`seat ${className}${vertical ? " seat-side" : ""}${turn ? " is-turn" : ""}${lead ? " is-lead" : ""}`}>
      {showBoom ? <FlipBoom key={`${burst!.id}-boom`} /> : null}
      {burst?.playerId === player.id && burst.kind === "save" && burst.saveCard && fx?.id === burst.id && fx.spin ? (
        <div className="flip-chance-hero" key={`${burst.id}-chance`}>
          <FlipFace card={burst.saveCard} />
        </div>
      ) : null}
      {showFlip7 ? (
        <div className="flip7-mark" aria-label="Flip 7">
          <b>FLIP 7</b>
          <span>+15</span>
        </div>
      ) : null}
      <div className={`seat-label${lead ? " is-lead" : ""}`}>
        {player.name} · {mine ? `round ${scored.score} · total ${player.total}` : `${player.total} PTS · ${player.status.toUpperCase()}`}
        {player.area.some((c) => c.kind === "chance") ? " · 2ND CHANCE" : ""}
        {player.pendingFlip3 > 0 ? ` · FLIP ${player.pendingFlip3}` : ""}
        {turn ? " · TURN" : ""}
        {lead ? " · LEAD" : ""}
      </div>
      <FitCards vertical={vertical} lockSize={lockSize}>
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
  const held = (!room && lobby.settlement?.game === "flip7" ? lobby.settlement.view : null) as FlipState | null;
  const state = (room?.view as FlipState | undefined) ?? held ?? local;
  const practice = Boolean(local && !room && !held);
  const youId = practice ? "you" : user?.id;
  const waiting = Boolean(state && state.phase === "lobby");
  const me = state ? state.players.find((p) => p.id === youId) ?? (waiting ? state.players[0] : currentFlip(state)) : null;
  const playerN = state?.players.length ?? 0;
  const useRing = Boolean(state && me && !waiting && playerN >= 5);
  const seated = state && me && !useRing ? aroundYou(state.players, me.id) : null;
  const ring = state && me && useRing ? ringOpponents(state.players, me.id) : null;
  const cur = state && state.phase !== "lobby" ? currentFlip(state) : null;
  const myTurn = Boolean(state && me && cur?.id === me.id && state.phase !== "over" && state.phase !== "lobby");
  const host = Boolean(me && state?.players[0]?.id === me.id);

  const burst = state?.burst ?? null;
  const [fx, setFx] = useState<{ id: string; boom: boolean; spin: boolean } | null>(null);
  const savePlaying = Boolean(burst?.kind === "save" && fx && fx.id === burst.id && (fx.boom || fx.spin));

  useEffect(() => {
    if (room) setLocal(null);
  }, [room]);

  const gameOver = state?.phase === "over";

  useEffect(() => {
    if (gameOver) {
      setFx(null);
      return;
    }
    if (!burst) return;
    const id = burst.id;
    const timers: number[] = [];
    let audio: HTMLAudioElement | null = null;
    if (burst.kind === "bust") {
      setFx({ id, boom: true, spin: false });
      timers.push(window.setTimeout(() => setFx(null), 1000));
    } else if (burst.kind === "save") {
      setFx({ id, boom: true, spin: false });
      timers.push(window.setTimeout(() => setFx({ id, boom: true, spin: true }), 360));
      timers.push(window.setTimeout(() => setFx({ id, boom: false, spin: true }), 720));
      timers.push(window.setTimeout(() => setFx(null), 1480));
    } else if (burst.kind === "freeze") {
      setFx({ id, boom: false, spin: false });
      audio = new Audio("/flip7-freeze.mp3?v=bing");
      audio.volume = 0.85;
      void audio.play().catch(() => {});
      timers.push(window.setTimeout(() => setFx(null), 1600));
    } else if (burst.kind === "flip7") {
      setFx({ id, boom: false, spin: false });
      timers.push(window.setTimeout(() => setFx(null), 1600));
    } else {
      setFx(null);
    }
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      if (audio) {
        audio.pause();
        audio.src = "";
      }
    };
  }, [burst?.id, burst?.kind, gameOver]);

  const freezeFx = Boolean(!gameOver && burst?.kind === "freeze" && fx?.id === burst.id);
  const flip7Fx = Boolean(!gameOver && burst?.kind === "flip7" && fx?.id === burst.id);
  const leadId = state && !waiting
    ? [...state.players].sort((a, b) => liveTotal(b) - liveTotal(a) || a.name.localeCompare(b.name))[0]?.id ?? null
    : null;

  useEffect(() => {
    if (!practice || !local || local.phase === "over" || local.phase === "lobby") return;
    const actor = currentFlip(local);
    const forced = local.phase === "action" && actor.pendingFlip3 > 0;
    if (actor.human && !forced) return;
    let stop = false;
    void (async () => {
      await wait(
        local.burst?.kind === "save"
          ? 1550
          : local.burst?.kind === "freeze" || local.burst?.kind === "flip7"
            ? 1650
            : local.burst?.kind === "bust"
              ? 1100
              : CPU_THINK_MS,
      );
      if (stop) return;
      setLocal((s) => {
        if (!s || s.phase === "lobby" || s.phase === "over") return s;
        const cur = currentFlip(s);
        if (s.phase === "target") {
          if (cur.human) return s;
          return applyFlipAction(s, cur.id, { type: "target", targetId: aiTarget(s) });
        }
        if (cur.pendingFlip3 > 0) return applyFlipAction(s, cur.id, { type: "hit" });
        if (cur.human) return s;
        return applyFlipAction(s, cur.id, { type: aiDecide(s) });
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
  const multi = Boolean(playing && !useRing && playerN > 2);
  const solo = Boolean(playing && playerN === 1);
  const cardScale = useRing ? Math.max(0.5, Math.min(0.95, 1.15 - 0.04 * playerN)) : 1;
  const ready = Boolean(playing && state && me && (useRing ? ring : seated));

  const statusText = (() => {
    if (!state || !me) return "";
    if (state.phase === "over") {
      return (
        forfeitText(state) ||
        (state.winnerId
          ? `${state.players.find((p) => p.id === state.winnerId)?.name ?? ""} wins`
          : state.log.at(-1)?.text || "Game over")
      );
    }
    if (freezeFx) return "Frozen!";
    if (flip7Fx) return "Flip 7! +15";
    if (savePlaying) return "Second Chance!";
    if (state.phase === "target") {
      return myTurn
        ? `Choose who gets ${state.pendingAction === "freeze" ? "Freeze" : "Flip Three"} — yourself included.`
        : cur?.name
          ? `${cur.name} is choosing a target.`
          : "Choosing a target.";
    }
    if (cur && cur.pendingFlip3 > 0 && state.phase === "action") {
      const n = cur.pendingFlip3;
      return myTurn ? `Flip Three: flipping ${n} more.` : `${cur.name} flips ${n} more from Flip Three.`;
    }
    if (myTurn) {
      return playerN === 1
        ? "Flip one card, or stay to bank this round."
        : "Flip one card, then the next player. Stay to bank this round.";
    }
    return `${cur?.name} is acting`;
  })();

  const centerWell = state && me ? (
    <div className="center-well">
      <div className="flip-center-row">
        <DeckStack count={state.deck.length} />
        <div className="status-line">
          {state.players
            .filter((p) => p.status === "left")
            .map((p) => `${p.name} left and loses.`)
            .join(" ")}
          {state.players.some((p) => p.status === "left") ? " " : ""}
          {statusText}
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
  ) : null;

  const youSeat = me ? (
    <div className="seat seat-you">
      <FlipSeat
        player={me}
        className="seat-you-inner"
        turn={myTurn}
        lead={leadId === me.id}
        burst={burst}
        fx={fx}
        mine
      />
      <div className="row-actions">
        <button
          className="btn btn-go"
          type="button"
          disabled={!myTurn || state?.phase !== "action" || savePlaying || me.pendingFlip3 > 0}
          onClick={() => act({ type: "hit" })}
        >
          HIT
        </button>
        <button
          className="btn btn-gold"
          type="button"
          disabled={!myTurn || state?.phase !== "action" || savePlaying || me.pendingFlip3 > 0}
          onClick={() => act({ type: "stay" })}
        >
          STAY
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div className="page-wide">
      <div className="game-head">
        <div>
          <p className="kicker">02 / FLIP7 · 2+</p>
          <h1>Flip 7</h1>
        </div>
        <div className="row-actions">
          <RulesButton game="flip7" />
          {solo && state?.record ? (
            <ClickPop label="Record">
              <SoloRecord record={state.record} />
            </ClickPop>
          ) : null}
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
        <div
          className={`table table-flip ${multi ? "flip-multi" : ""} ${solo ? "flip-solo" : ""} ${useRing ? "flip-ring" : ""}`}
          style={useRing ? ({ ["--flip-card-scale"]: String(cardScale) } as CSSProperties) : undefined}
        >
          {!ready || !state || !me ? (
            <>
              <LobbyDecor game="flip7" />
              <div className="coda-deal">
                <p className="kicker">{waiting ? "TABLE" : "FLIP 7"}</p>
                <h2>{waiting ? `Table ${state?.players.length ?? 0}` : "First to 200"}</h2>
                <p>
                  {waiting
                    ? "Open a table, add CPUs or invite people, then start with 2 or more. No fixed seat count."
                    : "Practice solo or vs CPU, or open a table. Hit or stay — Freeze and Flip Three can target anyone."}
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
                <MixedCpuBar
                  game="flip7"
                  onSolo={() => setLocal(startFlip7Solo())}
                  onPractice={(cpus) => setLocal(startFlip7(cpus + 1))}
                />
                <div className="row-actions" style={{ justifyContent: "center" }}>
                  {waiting ? (
                    host && (state?.players.length ?? 0) >= 2 ? (
                      <button className="btn" type="button" onClick={() => act({ type: "start" })}>
                        Start {state?.players.length}P
                      </button>
                    ) : (
                      <p>{host ? "Need at least 2 players to start." : "Waiting for the host to start."}</p>
                    )
                  ) : null}
                </div>
              </div>
            </>
          ) : useRing && ring ? (
            <>
              {freezeFx ? (
                <div className="flip-freeze-overlay" aria-live="polite">
                  <img src="/flip7-ice.jpg" alt="Freeze" />
                  <b>FREEZE</b>
                </div>
              ) : null}
              {flip7Fx ? (
                <div className="flip7-overlay" aria-live="polite">
                  <b>FLIP 7</b>
                  <span>+15</span>
                </div>
              ) : null}
              <div className="flip-ring-arena">
                {centerWell}
                {ring.map(({ player, xPct, yPct }) => (
                  <div
                    key={player.id}
                    className="seat-ring-slot"
                    style={{ ["--x"]: `${xPct}%`, ["--y"]: `${yPct}%` } as CSSProperties}
                  >
                    <FlipSeat
                      player={player}
                      className="seat-ring"
                      turn={cur?.id === player.id}
                      lead={leadId === player.id}
                      burst={burst}
                      fx={fx}
                      lockSize
                    />
                  </div>
                ))}
              </div>
              {youSeat}
            </>
          ) : seated ? (
            <>
              {freezeFx ? (
                <div className="flip-freeze-overlay" aria-live="polite">
                  <img src="/flip7-ice.jpg" alt="Freeze" />
                  <b>FREEZE</b>
                </div>
              ) : null}
              {flip7Fx ? (
                <div className="flip7-overlay" aria-live="polite">
                  <b>FLIP 7</b>
                  <span>+15</span>
                </div>
              ) : null}
              {seated.extras.length ? (
                <div className="flip-extras" aria-label="Other players">
                  {seated.extras.map((p) => (
                    <span key={p.id} className={`${cur?.id === p.id ? "on" : ""}${leadId === p.id ? " lead" : ""}`}>
                      {p.name} · {p.total}
                    </span>
                  ))}
                </div>
              ) : null}
              {seated.partner ? (
                <FlipSeat
                  player={seated.partner}
                  className="seat-partner"
                  turn={cur?.id === seated.partner.id}
                  lead={leadId === seated.partner.id}
                  burst={burst}
                  fx={fx}
                />
              ) : null}
              {seated.rival ? (
                <FlipSeat
                  player={seated.rival}
                  className="seat-rival"
                  turn={cur?.id === seated.rival.id}
                  lead={leadId === seated.rival.id}
                  burst={burst}
                  fx={fx}
                />
              ) : null}
              {seated.left ? (
                <FlipSeat
                  player={seated.left}
                  className="seat-left"
                  vertical
                  turn={cur?.id === seated.left.id}
                  lead={leadId === seated.left.id}
                  burst={burst}
                  fx={fx}
                />
              ) : null}
              {centerWell}
              {seated.right ? (
                <FlipSeat
                  player={seated.right}
                  className="seat-right"
                  vertical
                  turn={cur?.id === seated.right.id}
                  lead={leadId === seated.right.id}
                  burst={burst}
                  fx={fx}
                />
              ) : null}
              {youSeat}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function drawText(draw: FlipDraw): string {
  const label = cardLabel(draw);
  if (draw.note === "saved") return `${label} saved at ${draw.at ?? 0}`;
  if (draw.note === "bust") return `${label} bust at ${draw.at ?? 0}`;
  if (draw.note === "discard") return `${label} out`;
  return label;
}

function bustAvg(sums: number[]): string {
  if (!sums.length) return "—";
  const avg = sums.reduce((sum, n) => sum + n, 0) / sums.length;
  return Number.isInteger(avg) ? String(avg) : avg.toFixed(1);
}

function chanceText(chance: number): string {
  const pct = chance * 100;
  if (pct >= 99.95) return "100%";
  if (pct <= 0.05) return "0%";
  const rounded = pct.toFixed(1);
  return `${rounded.endsWith(".0") ? rounded.slice(0, -2) : rounded}%`;
}

function resultText(round: FlipRoundRecord): string {
  if (!round.result) return "drawing";
  if (round.result === "bust") return "Bust 0";
  if (round.result === "flip7") return `Flip 7 +${round.score ?? 0}`;
  if (round.result === "freeze") return `Freeze +${round.score ?? 0}`;
  return `Stay +${round.score ?? 0}`;
}

function SoloRecord({ record }: { record: FlipSoloRecord }) {
  const rounds = [...record.rounds].reverse();
  const pops = record.rounds.flatMap((round) => round.draws).filter((draw) => draw.note === "bust" || draw.note === "saved");
  const sums = pops.map((draw) => draw.at ?? 0);
  const done = record.rounds.filter((round) => round.result);
  const flips = done.filter((round) => round.result === "flip7").length;
  return (
    <aside className="side flip-record" aria-label="Solo record">
      <div>
        <h3>Record</h3>
        <p className="flip-record-avg">
          <b>{bustAvg(sums)}</b>
          <span>avg number sum at bust</span>
        </p>
        <p className="flip-record-avg">
          <b>{done.length ? chanceText(flips / done.length) : "—"}</b>
          <span>{done.length ? `flip 7 · ${flips} of ${done.length}` : "flip 7 rounds"}</span>
        </p>
        <p>{sums.length ? sums.join(" · ") : "No bust yet. A Second Chance save counts as one."}</p>
      </div>
      <div className="flip-record-rounds">
        {rounds.map((round) => {
          const numbers = round.draws.filter((draw) => draw.kind === "number");
          return (
            <div key={round.round} className={`flip-record-round${round.result ? "" : " is-live"}`}>
              <b>R{round.round}</b>
              <span>{numbers.length ? numbers.map(drawText).join(" · ") : "—"}</span>
              <em>{resultText(round)}</em>
            </div>
          );
        })}
      </div>
    </aside>
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
