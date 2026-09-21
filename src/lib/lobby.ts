const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export type OnlinePlayer = { id: string; name: string; avatar?: string; online?: boolean; roomId?: string | null };

export type Invite = {
  id: string;
  game: string;
  fromId: string;
  fromName: string;
  fromAvatar?: string;
  toId: string;
  toName: string;
  toAvatar?: string;
  meta?: Record<string, unknown>;
};

export type RoomSnap = {
  id: string;
  game: string;
  seats: string[];
  endsAt: number | null;
  seq?: number;
  view: unknown;
};

export type LobbySnap = {
  online: OnlinePlayer[];
  invites: Invite[];
  room: RoomSnap | null;
  store?: "redis" | "memory";
  light?: boolean;
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

export const GAME_LABEL: Record<string, string> = {
  coda: "Coda",
  flip7: "Flip 7",
  bj: "Blackjack",
  m24: "Make 24",
  holdem: "Hold’em",
  guandan: "Guandan",
  uno: "UNO",
};

export const lobbyApi = {
  sync(token: string, href = "", light = false) {
    const q = `href=${encodeURIComponent(href)}${light ? "&light=1" : ""}`;
    return call(token, `/api/lobby?${q}`);
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
  holdem: "/play/holdem",
  guandan: "/play/guandan",
  uno: "/play/uno",
};
