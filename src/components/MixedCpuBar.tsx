import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useLobby } from "../context/LobbyContext";
import { GAME_LABEL, isCpuId, matchNeed, minStart, tableMax } from "../lib/lobby";

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
  const view = here ? (room?.view as { phase?: string; street?: string } | undefined) : undefined;
  const waiting = Boolean(here && (view?.phase === "lobby" || view?.street === "lobby"));
  const duel = max <= 2;
  /** Only show add/remove after a live lobby table exists. */
  const atTable = here && waiting && host;
  const canOpen = Boolean(user && !busy && (!here || !waiting || host));
  const showPractice = Boolean(onPractice && !atTable && !waiting);
  const searching = Boolean(queue && queue.game === game);
  const need = matchNeed(game);
  const canMatch = Boolean(user && !busy && !atTable && !waiting);

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

  return (
    <div className="cpu-bar">
      <p>
        {searching
          ? need > 2
            ? `Searching for ${GAME_LABEL[game] || game}. ${queue?.waiting ?? 1} of ${need} in queue.`
            : `Searching for a player. ${queue?.waiting ?? 1} in queue.`
          : !atTable
            ? showPractice
              ? onSolo
                ? "Practice, find a match, or open a table to add a CPU / invite."
                : "Practice vs CPU, find a match, or open a table to invite."
              : "Find a match, or open a table and invite from the player list."
            : duel
              ? "Add a CPU or invite one friend from the player list, then start."
              : max >= 16
                ? "Add CPUs or invite humans, then start with 2+."
                : `Add CPUs or invite humans, then start with ${minStart(game)}–${max}.`}
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
              if (searching) void cancelMatch();
              onPractice?.(cpus);
            }}
          >
            {practiceLabel()}
          </button>
        ) : null}
        {searching ? (
          <button className="btn" type="button" disabled={busy} onClick={() => void stopSearch()}>
            {busy ? "Canceling…" : "Cancel search"}
          </button>
        ) : !atTable ? (
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

export function seatTag(player: { id: string; human?: boolean }, index: number, hostId?: string) {
  if (isCpuId(player.id) || player.human === false) return "cpu";
  if (hostId ? player.id === hostId : index === 0) return "host";
  return "seated";
}
