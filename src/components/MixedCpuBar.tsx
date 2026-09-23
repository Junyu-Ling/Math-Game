import { useAuth } from "../context/AuthContext";
import { useLobby } from "../context/LobbyContext";
import { isCpuId } from "../lib/lobby";

export function MixedCpuBar({ game, meta }: { game: string; meta?: Record<string, unknown> }) {
  const { user } = useAuth();
  const { room, error, adjustCpu } = useLobby();
  const here = Boolean(room && room.game === game);
  const host = Boolean(user && (!here || room?.seats[0] === user.id));
  const seats = here ? room?.seats || [] : [];
  const cpuN = seats.filter(isCpuId).length;
  const full = seats.length >= 4;
  const waiting = Boolean(here && (room?.view as { phase?: string } | undefined)?.phase === "lobby");
  const canEdit = Boolean(user && host && (!here || waiting));

  if (!user) return null;

  return (
    <div className="cpu-bar">
      <p>A new table starts with you. Add CPUs only when you want them. 2–4 players can sit.</p>
      <div className="row-actions" style={{ justifyContent: "center" }}>
        {!here ? (
          <button
            className="btn"
            type="button"
            disabled={!canEdit}
            onClick={() => void adjustCpu(game, "open", meta).catch((ex) => alert(ex.message))}
          >
            Open table
          </button>
        ) : null}
        <button
          className="btn btn-ghost"
          type="button"
          disabled={!canEdit || full}
          onClick={() => void adjustCpu(game, "add", meta).catch((ex) => alert(ex.message))}
        >
          Add CPU
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={!here || !canEdit || full}
          onClick={() => void adjustCpu(game, "fill", meta).catch((ex) => alert(ex.message))}
        >
          Fill with CPU
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          disabled={!canEdit || cpuN < 1}
          onClick={() => void adjustCpu(game, "remove", meta).catch((ex) => alert(ex.message))}
        >
          Remove CPU
        </button>
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
