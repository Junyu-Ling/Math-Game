import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useLobby } from "../context/LobbyContext";
import { isCpuId, tableMax } from "../lib/lobby";

export function MixedCpuBar({
  game,
  meta,
  onPractice,
}: {
  game: string;
  meta?: Record<string, unknown>;
  /** Local Practice vs CPU — no login / Open table required. */
  onPractice?: () => void;
}) {
  const { user } = useAuth();
  const { room, error, adjustCpu } = useLobby();
  const [busy, setBusy] = useState(false);
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

  if (!user) {
    return (
      <div className="cpu-bar">
        <p>
          {onPractice
            ? "Practice vs CPU anytime. Sign in to open a table or invite someone."
            : "Sign in to open a table, then add a CPU or invite someone."}
        </p>
        {onPractice ? (
          <div className="row-actions" style={{ justifyContent: "center" }}>
            <button className="btn" type="button" onClick={onPractice}>
              Practice vs CPU
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="cpu-bar">
      <p>
        {!atTable
          ? showPractice
            ? "Practice locally vs CPU, or open a table to add a CPU / invite."
            : "Open a table first. Then you can add a CPU or invite from the player list."
          : duel
            ? "Add a CPU or invite one friend from the player list, then start."
            : max >= 16
              ? "Add CPUs or invite humans, then start with 2+."
              : `Add CPUs or invite humans, then start with 2–${max}.`}
      </p>
      <div className="row-actions" style={{ justifyContent: "center" }}>
        {showPractice ? (
          <button className="btn btn-ghost" type="button" onClick={onPractice}>
            Practice vs CPU
          </button>
        ) : null}
        {!atTable ? (
          <button className="btn" type="button" disabled={!canOpen} onClick={() => void run("open")}>
            {busy ? "Opening…" : here && !waiting ? "New table" : "Open table"}
          </button>
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

export function seatTag(player: { id: string; human?: boolean }, index: number, hostId?: string) {
  if (isCpuId(player.id) || player.human === false) return "cpu";
  if (hostId ? player.id === hostId : index === 0) return "host";
  return "seated";
}
