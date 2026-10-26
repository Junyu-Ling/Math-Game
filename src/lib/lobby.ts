const apiBase = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export type OnlinePlayer = {
  id: string;
  name: string;
  login?: string;
  avatar?: string;
  email?: string;
  online?: boolean;
  roomId?: string | null;
};

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

export type Settlement = { game: string; view: unknown };

export type LobbySnap = {
  online: OnlinePlayer[];
  invites: Invite[];
  room: RoomSnap | null;
  store?: "redis" | "memory";
  light?: boolean;
  settlement?: Settlement | null;
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
  // Deferred — Make 24
  // m24: "Make 24",
  holdem: "Hold’em",
  uno: "UNO",
  halli: "Halli Galli",
  ecard: "E-Card",
  gomoku: "Gomoku",
  // Deferred — Werewolf
  // werewolf: "Werewolf",
  roulette: "European Roulette",
  slots: "Slot Machine",
  // Deferred — Flying Chess
  // ludo: "Flying Chess",
  // Deferred
  // animal: "Animal Chess",
  // army: "Army Chess",
};

/** Soft seat cap for open tables. Flip 7 is effectively unlimited. */
export function tableMax(game: string) {
  if (game === "flip7") return 16;
  if (game === "werewolf") return 8;
  if (game === "gomoku" || game === "ecard" || game === "bj" || game === "m24" || game === "holdem")
    return 2;
  return 4;
}

export function minStart(game?: string) {
  if (game === "werewolf") return 4;
  return 2;
}

export function isCpuId(id: string) {
  return /^(cpu|bot|ai)/i.test(id);
}

export const lobbyApi = {
  sync(token: string, href = "", light = false) {
    const q = `href=${encodeURIComponent(href)}${light ? "&light=1" : ""}`;
    return call(token, `/api/lobby?${q}`);
  },
  watch(token: string, seq: number, invites: number, href = "", signal?: AbortSignal) {
    const q = `watch=1&seq=${encodeURIComponent(String(seq))}&invites=${encodeURIComponent(String(invites))}&href=${encodeURIComponent(href)}`;
    return call(token, `/api/lobby?${q}`, { signal });
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
  cpu(token: string, game: string, mode: "add" | "remove" | "fill" | "open", meta: Record<string, unknown> = {}) {
    return call(token, "/api/lobby", { method: "POST", body: JSON.stringify({ op: "cpu", game, mode, meta }) });
  },
  leave(token: string) {
    return call(token, "/api/lobby", { method: "POST", body: JSON.stringify({ op: "leave" }) });
  },
  /** Best-effort leave when the tab closes (does not await a JSON body). */
  leaveKeepalive(token: string) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };
    void fetch(`${apiBase}/api/lobby`, {
      method: "POST",
      headers,
      body: JSON.stringify({ op: "leave" }),
      keepalive: true,
    });
  },
};

export const GAME_PATH: Record<string, string> = {
  coda: "/play/davinci",
  flip7: "/play/flip7",
  bj: "/play/blackjack",
  // Deferred — Make 24
  // m24: "/play/24",
  holdem: "/play/holdem",
  uno: "/play/uno",
  halli: "/play/halli",
  ecard: "/play/ecard",
  gomoku: "/play/gomoku",
  // Deferred — Werewolf
  // werewolf: "/play/werewolf",
  roulette: "/play/roulette",
  slots: "/play/slots",
  // Deferred — Flying Chess
  // ludo: "/play/ludo",
  // Deferred
  // animal: "/play/animal",
  // army: "/play/army",
};
