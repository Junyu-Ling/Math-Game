import { useLobby } from "../context/LobbyContext";

export function WatchBar() {
  const { room, playback, watchLive, watchStart, watchScrub, leave } = useLobby();
  if (!room?.spectate || playback.total < 1) return null;
  const last = Math.max(0, playback.total - 1);
  const saved = room.id.startsWith("replay:");
  return (
    <div className="watch-bar" role="region" aria-label="Watch">
      <strong>{saved ? "Recording" : "Watching"}</strong>
      <button className="btn btn-ghost" type="button" onClick={watchStart}>
        From start
      </button>
      {saved ? null : (
        <button className={`btn ${playback.live ? "" : "btn-ghost"}`} type="button" onClick={watchLive}>
          Live
        </button>
      )}
      <input
        className="watch-range"
        type="range"
        min={0}
        max={last}
        value={Math.min(playback.index, last)}
        aria-label="Match timeline"
        onChange={(event) => watchScrub(Number(event.target.value))}
      />
      <span className="watch-count">
        {Math.min(playback.index, last) + 1}/{playback.total}
      </span>
      <button className="btn" type="button" onClick={() => void leave()}>
        Exit
      </button>
    </div>
  );
}
