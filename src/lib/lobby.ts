const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export type OnlinePlayer = { id: string; name: string; avatar?: string; roomId?: string | null };

export type Invite = {
  id: string;
  game: string;
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  meta?: Record<string, unknown>;
};

export type RoomSnap = {
  id: string;
  game: string;
  seats: string[];
  endsAt: number | null;
  view: unknown;
};

export type LobbySnap = {
  online: OnlinePlayer[];
  invites: Invite[];
  room: RoomSnap | null;
  store?: "redis" | "memory";
};

async function call(token: string, path: string, init: RequestInit = {}): Promise<LobbySnap & Record<string, unknown>> {
  const res = await fetch(`${apiBase}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as LobbySnap & { error?: string };
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const lobbyApi = {
  sync(token: string, href = "") {
    return call(token, `/api/lobby?href=${encodeURIComponent(href)}`);
  },
  invite(token: string, toId: string, game: string, meta: Record<string, unknown> = {}) {
    return call(token, "/api/lobby", { method: "POST", body: JSON.stringify({ op: "invite", toId, game, meta }) });
  },
  respond(token: string, id: string, accept: boolean) {
    return call(token, "/api/lobby", { method: "POST", body: JSON.stringify({ op: "respond", id, accept }) });
  },
  action(token: string, roomId: string, action: object) {
    return call(token, "/api/lobby", { method: "POST", body: JSON.stringify({ op: "action", roomId, action }) });
  },
  leave(token: string) {
    return call(token, "/api/lobby", { method: "POST", body: JSON.stringify({ op: "leave" }) });
  },
};

export const GAME_PATH: Record<string, string> = {
  coda: "/play/davinci",
  flip7: "/play/flip7",
  bj: "/play/blackjack",
  m24: "/play/24",
  uno: "/play/uno",
};
