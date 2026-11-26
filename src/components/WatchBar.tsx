import { useEffect, useRef, useState } from "react";
import { useLobby } from "../context/LobbyContext";
import type { RoomSnap } from "../lib/lobby";
import { consumeQueuedRecording, recordVisibleMatch } from "../lib/recording";

function seatName(room: RoomSnap, id: string) {
  const sources = [room.tape?.[0]?.views?.watch, room.tape?.[0]?.view, room.view] as Array<{ faces?: { id: string; name?: string }[]; players?: { id: string; name?: string }[] } | undefined>;
  for (const source of sources) {
    const face = source?.faces?.find((item) => item.id === id);
    if (face?.name) return face.name;
    const player = source?.players?.find((item) => item.id === id);
    if (player?.name) return player.name;
  }
  return /^cpu/i.test(id) ? "CPU" : "Player";
}

export function WatchBar() {
  const { room, playback, watchLive, watchStart, watchScrub, watchPlay, watchAngle, leave } = useLobby();
  const [saving, setSaving] = useState("");
  const [saveErr, setSaveErr] = useState("");
  const resumePlay = useRef(false);
  const watching = Boolean(room?.spectate && playback.total >= 1);

  async function saveVideo() {
    if (!room?.spectate || playback.total < 1 || saving) return;
    const wasLive = playback.live;
    const wasIndex = playback.index;
    const wasPlaying = playback.playing;
    setSaveErr("");
    setSaving("Saving MP4…");
    watchPlay(false);
    try {
      await recordVisibleMatch({
        game: room.game,
        matchId: room.id,
        total: playback.total,
        times: (room.tape ?? []).map((frame) => frame.t),
        seek: watchScrub,
        onProgress: (done, total) => setSaving(`Saving MP4 ${done}/${total}`),
      });
      setSaving("");
      if (wasLive) watchLive();
      else {
        watchScrub(wasIndex);
        if (wasPlaying) watchPlay(true);
      }
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
  const angles = (room.seats || []).filter(Boolean);
  return (
    <div className="watch-bar" role="region" aria-label="Watch">
      <div className="watch-angles" role="tablist" aria-label="Viewpoint">
        <button type="button" role="tab" aria-selected={playback.angle === "watch"} className={playback.angle === "watch" ? "is-on" : ""} disabled={Boolean(saving)} onClick={() => watchAngle("watch")}>
          Table
        </button>
        {angles.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={playback.angle === id} className={playback.angle === id ? "is-on" : ""} disabled={Boolean(saving)} onClick={() => watchAngle(id)}>
            {seatName(room, id)}
          </button>
        ))}
      </div>
      <div className="watch-controls">
      <strong>{saved ? "Recording" : "Watching"}</strong>
      {playback.live ? null : (
        <button
          className="btn"
          type="button"
          disabled={Boolean(saving)}
          onClick={() => {
            if (!playback.playing && playback.index >= last) watchStart();
            else watchPlay(!playback.playing);
          }}
        >
          {playback.playing ? "Pause" : "Play"}
        </button>
      )}
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
        onPointerDown={() => {
          resumePlay.current = playback.playing;
          if (playback.playing) watchPlay(false);
        }}
        onPointerUp={() => {
          if (!resumePlay.current) return;
          resumePlay.current = false;
          watchPlay(true);
        }}
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
    </div>
  );
}
