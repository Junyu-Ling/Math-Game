import type { TapeFrame } from "./lobby";

export function downloadRecording(game: string, matchId: string, tape: TapeFrame[]) {
  const safeGame = (game || "game").replace(/[^\w.-]+/g, "");
  const body = {
    game: game || "game",
    matchId,
    savedAt: new Date().toISOString(),
    tape,
  };
  const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `bitefun-${safeGame || "game"}-${matchId.replace(/[^\w.-]+/g, "").slice(0, 24) || "match"}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
