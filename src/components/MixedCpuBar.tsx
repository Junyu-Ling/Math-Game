import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLobby } from "../context/LobbyContext";
import { GAME_LABEL, isCpuId, matchNeed, minStart, tableMax } from "../lib/lobby";
import { Avatar } from "./Avatar";

export function MixedCpuBar({
  game,
  meta,
  onPractice,
  onSolo,
  cpus: cpusProp,
  onCpus,
}: {
  game: string;
  meta?: Record<string, unknown>;
  /** Local Practice vs CPU — no login / Open table required. Argument is how many CPUs. */
  onPractice?: (cpus: number) => void;
  /** Local solo practice — no opponents. */
  onSolo?: () => void;
  /** Controlled CPU count, when the page already tracks table size. */
  cpus?: number;
  onCpus?: (cpus: number) => void;
}) {
  const { user } = useAuth();
  const { room, error, adjustCpu, queue, findMatch, cancelMatch } = useLobby();
  const [busy, setBusy] = useState(false);
  const cpuMax = Math.max(1, tableMax(game) - 1);
  const cpuMin = Math.max(1, minStart(game) - 1);
  const [ownCpus, setOwnCpus] = useState(() => (game === "werewolf" ? 5 : cpuMin));
  const cpus = Math.max(cpuMin, Math.min(cpuMax, cpusProp ?? ownCpus));
  const pickCpus = cpuMax > cpuMin;
  const here = Boolean(room && room.game === game);
  const host = Boolean(user && (!here || room?.seats[0] === user.id));
  const seats = here ? room?.seats || [] : [];
  const cpuN = seats.filter(isCpuId).length;
  const max = tableMax(game);
  const full = seats.length >= max;
  const view = here ? (room?.view as { phase?: string; street?: string; matched?: boolean } | undefined) : undefined;
  const waiting = Boolean(here && (view?.phase === "lobby" || view?.street === "lobby"));
  const matched = Boolean(view?.matched);
  const duel = max <= 2;
  const seatedHere = Boolean(here && waiting);
  /** Host-only add/remove after a live lobby table exists. */
  const atTable = seatedHere && host;
  const canOpen = Boolean(user && !busy && (!here || !waiting || host));
  const showPractice = Boolean(onPractice && !atTable && !waiting);
  const searching = Boolean(queue && queue.game === game);
  const need = matchNeed(game);
  const canMatch = Boolean(user && !busy && !seatedHere);

  function setCpus(next: number) {
    const n = Math.max(cpuMin, Math.min(cpuMax, next));
    onCpus?.(n);
    if (cpusProp == null) setOwnCpus(n);
  }

  function practiceLabel() {
    if (!pickCpus) return "Practice vs CPU";
    return `Practice vs ${cpus} CPU${cpus === 1 ? "" : "s"}`;
  }

  async function run(mode: "open" | "add" | "remove" | "fill") {
    if (busy) return;
    setBusy(true);
    try {
      await adjustCpu(game, mode, meta);
    } catch (ex) {
      alert(ex instanceof Error ? ex.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function search() {
    if (busy) return;
    setBusy(true);
    try {
      await findMatch(game, meta);
    } catch (ex) {
      alert(ex instanceof Error ? ex.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function stopSearch() {
    if (busy) return;
    setBusy(true);
    try {
      await cancelMatch();
    } catch (ex) {
      alert(ex instanceof Error ? ex.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="cpu-bar">
        <p>
          {onPractice
            ? onSolo
              ? "Practice solo or vs CPU anytime. Sign in to find a match, open a table, or invite someone."
              : "Practice vs CPU anytime. Sign in to find a match, open a table, or invite someone."
            : "Sign in to find a match, or open a table and invite someone."}
        </p>
        <div className="row-actions" style={{ justifyContent: "center" }}>
          {showPractice && pickCpus ? <CpuCount cpus={cpus} min={cpuMin} max={cpuMax} onChange={setCpus} /> : null}
          {onSolo ? (
            <button className="btn btn-ghost" type="button" onClick={onSolo}>
              Practice Solo
            </button>
          ) : null}
          {onPractice ? (
            <button className="btn btn-ghost" type="button" onClick={() => onPractice(cpus)}>
              {practiceLabel()}
            </button>
          ) : null}
          <Link className="btn" to="/login">
            Log in to find a match
          </Link>
        </div>
      </div>
    );
  }

  if (searching) {
    return (
      <>
        <MatchDuel game={game} busy={busy} onCancel={() => void stopSearch()} />
        {error ? <p className="msg err">{error}</p> : null}
      </>
    );
  }

  return (
    <div className="cpu-bar">
      <p>
        {seatedHere && !host
            ? "You're at the table. Ready up when you're set."
            : !atTable
              ? showPractice
                ? onSolo
                  ? "Practice, find a match, or open a table to add a CPU / invite."
                  : "Practice vs CPU, find a match, or open a table to invite."
                : "Find a match, or open a table and invite from the player list."
              : matched
                ? "Table is open. Ready up — the game starts when everyone is ready."
                : duel
                  ? "Add a CPU or invite one friend from the player list, then everyone Ready."
                  : max >= 16
                    ? "Add CPUs or invite humans, then everyone Ready with 2+."
                    : `Add CPUs or invite humans, then everyone Ready with ${minStart(game)}–${max}.`}
      </p>
      <div className="row-actions" style={{ justifyContent: "center" }}>
        {showPractice && pickCpus ? <CpuCount cpus={cpus} min={cpuMin} max={cpuMax} onChange={setCpus} /> : null}
        {showPractice && onSolo ? (
          <button className="btn btn-ghost" type="button" onClick={onSolo}>
            Practice Solo
          </button>
        ) : null}
        {showPractice ? (
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() => {
              onPractice?.(cpus);
            }}
          >
            {practiceLabel()}
          </button>
        ) : null}
        {seatedHere && !host ? null : !atTable ? (
          <>
            <button className="btn" type="button" disabled={!canMatch} onClick={() => void search()}>
              {busy ? "Searching…" : need > 2 ? `Find match · ${need}P` : "Find match"}
            </button>
            <button className="btn btn-ghost" type="button" disabled={!canOpen} onClick={() => void run("open")}>
              {busy ? "Opening…" : here && !waiting ? "New table" : "Open table"}
            </button>
          </>
        ) : (
          <>
            <button className="btn btn-ghost" type="button" disabled={busy || full} onClick={() => void run("add")}>
              Add CPU
            </button>
            {!duel ? (
              <button className="btn btn-ghost" type="button" disabled={busy || full} onClick={() => void run("fill")}>
                {max >= 16 ? "Add 3 CPUs" : "Fill with CPU"}
              </button>
            ) : null}
            <button className="btn btn-ghost" type="button" disabled={busy || cpuN < 1} onClick={() => void run("remove")}>
              Remove CPU
            </button>
          </>
        )}
      </div>
      {error ? <p className="msg err">{error}</p> : null}
    </div>
  );
}

function MatchDuel({
  game,
  busy,
  onCancel,
}: {
  game: string;
  busy: boolean;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const { queue } = useLobby();
  const mark = useRef<HTMLSpanElement>(null);
  const [host, setHost] = useState<Element | null>(null);

  useLayoutEffect(() => {
    setHost(mark.current?.closest(".table") ?? null);
  }, []);

  if (!queue || queue.game !== game) return null;

  const name = user?.login || user?.name || user?.email?.split("@")[0] || "You";
  const need = matchNeed(game);
  const ui = (
    <div className="match-duel" role="status" aria-live="polite">
      <button className="match-duel-close" type="button" aria-label="Cancel search" disabled={busy} onClick={onCancel}>
        ×
      </button>
      <div className="match-duel-title">
        <p className="kicker">Find match</p>
        <h2>{GAME_LABEL[game] || game}</h2>
      </div>
      <div className="match-duel-row">
        <div className="match-duel-slot">
          <div className="match-duel-face">
            <Avatar src={user?.avatar} name={name} size={96} />
          </div>
          <span className="match-duel-name">{name}</span>
        </div>
        <span className="match-duel-vs" aria-hidden>
          VS
        </span>
        <div className="match-duel-slot">
          <div className="match-duel-face is-wait">?</div>
          <span className="match-duel-name is-wait">Waiting</span>
        </div>
      </div>
      <p className="match-duel-status">
        {need > 2 ? `${queue.waiting} of ${need} in queue` : "Looking for a player"}
      </p>
      <button className="btn btn-ghost" type="button" disabled={busy} onClick={onCancel}>
        {busy ? "Canceling…" : "Cancel"}
      </button>
    </div>
  );

  return (
    <>
      <span ref={mark} hidden />
      {host ? createPortal(ui, host) : ui}
    </>
  );
}

function CpuCount({
  cpus,
  min,
  max,
  onChange,
}: {
  cpus: number;
  min: number;
  max: number;
  onChange: (next: number) => void;
}) {
  return (
    <div className="deal-step cpu-count" role="group" aria-label="CPUs">
      <button type="button" disabled={cpus <= min} onClick={() => onChange(cpus - 1)} aria-label="Fewer CPUs">
        −
      </button>
      <b>
        {cpus} CPU{cpus === 1 ? "" : "s"}
      </b>
      <button type="button" disabled={cpus >= max} onClick={() => onChange(cpus + 1)} aria-label="More CPUs">
        +
      </button>
    </div>
  );
}

export function seatTag(
  player: { id: string; human?: boolean; ready?: boolean },
  index: number,
  hostId?: string,
  readyIds?: string[],
) {
  if (isCpuId(player.id) || player.human === false) return "cpu";
  const host = hostId ? player.id === hostId : index === 0;
  const ready = Boolean(player.ready || readyIds?.includes(player.id));
  if (ready) return host ? "host · ready" : "ready";
  if (host) return "host";
  return "seated";
}

export function TableReadyControls({
  waiting,
  game,
  players,
  youId,
  readyIds,
  matched,
  onReady,
}: {
  waiting: boolean;
  game: string;
  players: Array<{ id: string; human?: boolean; ready?: boolean }>;
  youId?: string;
  readyIds?: string[];
  matched?: boolean;
  onReady: () => void;
}) {
  if (!waiting) return null;
  const need = minStart(game);
  const humans = players.filter((p) => !isCpuId(p.id) && p.human !== false);
  if (players.length < need) {
    return <p>Need at least {need} players to start.</p>;
  }
  const marked = new Set([...(readyIds || []), ...players.filter((p) => p.ready).map((p) => p.id)]);
  const mineReady = Boolean(youId && marked.has(youId));
  const humanReady = humans.filter((p) => marked.has(p.id)).length;
  return (
    <>
      {matched ? <p>Table is open. Ready up — the game starts when everyone is ready.</p> : null}
      <button className="btn" type="button" disabled={mineReady} onClick={onReady}>
        {mineReady ? "Waiting for others" : "Ready"}
      </button>
      <p>
        {humanReady}/{humans.length} ready
      </p>
    </>
  );
}
