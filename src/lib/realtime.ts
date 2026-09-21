import type { CodaAction, CodaState } from "../games/davinci/engine";

export type ServerMsg =
  | { type: "queued" }
  | { type: "matched"; roomId: string; youId: string }
  | { type: "state"; roomId: string; view: CodaState; arrangeEndsAt: number | null }
  | { type: "left" }
  | { type: "error"; error: string };

const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export function wsUrl(token: string): string {
  const http = apiBase || "http://localhost:8787";
  const ws = http.replace(/^http/, "ws");
  return `${ws}/ws?token=${encodeURIComponent(token)}`;
}

export function connectCoda(
  token: string,
  onMessage: (msg: ServerMsg) => void,
): { send: (data: object) => void; close: () => void } {
  const socket = new WebSocket(wsUrl(token));
  socket.onmessage = (ev) => {
    try {
      onMessage(JSON.parse(String(ev.data)) as ServerMsg);
    } catch {
      /* ignore */
    }
  };
  socket.onerror = () => onMessage({ type: "error", error: "WebSocket 连接失败。请确认后端与 Redis 已启动。" });
  return {
    send(data) {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(data));
      else socket.addEventListener("open", () => socket.send(JSON.stringify(data)), { once: true });
    },
    close() {
      socket.close();
    },
  };
}

export type QueuePayload = {
  useJokers: boolean;
  black: number;
  white: number;
};

export function sendQueue(conn: { send: (data: object) => void }, payload: QueuePayload) {
  conn.send({ type: "queue", ...payload });
}

export function sendLeave(conn: { send: (data: object) => void }) {
  conn.send({ type: "leave" });
}

export function sendAction(conn: { send: (data: object) => void }, roomId: string, action: CodaAction) {
  conn.send({ type: "action", roomId, action });
}
