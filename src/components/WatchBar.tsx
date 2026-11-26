import { useEffect, useState } from "react";
import { useLobby } from "../context/LobbyContext";
import { consumeQueuedRecording, recordVisibleMatch } from "../lib/recording";

export function WatchBar() {
  const { room, playback, watchLive, watchStart, watchScrub, leave } = useLobby();
  const [saving, setSaving] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const watching = Boolean(room?.spectate && playback.total >= 1);

  async function saveVideo() {
    if (!room?.spectate || playback.total < 1 || saving) return;
    const wasLive = playback.live;
    const wasIndex = playback.index;
    setSaveErr("");
    setSaving("Saving MP4…");
    try {
      await recordVisibleMatch({
        game: room.game,
        matchId: room.id,
        total: playback.total,
        seek: watchScrub,
        onProgress: (done, total) => setSaving(`Saving MP4 ${done}/${total}`),
      });
      setSaving("");
      if (wasLive) watchLive();
      else watchScrub(wasIndex);
    } catch (err) {
      setSaving("");
      setSaveErr(err instanceof Error ? err.message : "Could not save the video");
    }
  }

  useEffect(() => {
    if (!watching || !room || saving) return;
    if (!consumeQueuedRecording(room.id)) return;
    void saveVideo();
    // saveVideo closes over the room that just opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watching, room?.id]);

  if (!watching || !room) return null;
  const last = Math.max(0, playback.total - 1);
  const saved = room.id.startsWith("replay:");
  return (
    <div className="watch-bar" role="region" aria-label="Watch">
      <strong>{saved ? "Recording" : "Watching"}</strong>
      <button className="btn btn-ghost" type="button" onClick={watchStart} disabled={Boolean(saving)}>
        From start
      </button>
      {saved ? null : (
        <button className={`btn ${playback.live ? "" : "btn-ghost"}`} type="button" onClick={watchLive} disabled={Boolean(saving)}>
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
        disabled={Boolean(saving)}
        onChange={(event) => watchScrub(Number(event.target.value))}
      />
      <span className="watch-count">
        {saving || saveErr || `${Math.min(playback.index, last) + 1}/${playback.total}`}
      </span>
      <button className="btn btn-ghost" type="button" disabled={Boolean(saving)} onClick={() => void saveVideo()}>
        {saving ? "Saving…" : "Save MP4"}
      </button>
      <button className="btn" type="button" onClick={() => void leave()} disabled={Boolean(saving)}>
        Exit
      </button>
    </div>
  );
}
