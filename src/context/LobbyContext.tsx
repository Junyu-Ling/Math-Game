import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { GAME_PATH, lobbyApi, type Invite, type LobbySnap, type OnlinePlayer, type QueueSnap, type RoomSnap, type Settlement } from "../lib/lobby";

type LobbyCtx = {
  online: OnlinePlayer[];
  invites: Invite[];
  room: RoomSnap | null;
  queue: QueueSnap | null;
  error: string;
  store: "redis" | "memory" | "";
  inviteCooldownMs: number;
  invite: (toId: string, game: string, meta?: Record<string, unknown>) => Promise<void>;
  findMatch: (game: string, meta?: Record<string, unknown>) => Promise<void>;
  cancelMatch: () => Promise<void>;
  respond: (id: string, accept: boolean) => Promise<void>;
  sendAction: (action: object) => Promise<void>;
  adjustCpu: (game: string, mode: "add" | "remove" | "fill" | "open", meta?: Record<string, unknown>) => Promise<void>;
  leave: () => Promise<void>;
  /** Leave the table (if any) and go home — use this instead of a bare Link from game pages. */
  leaveHome: () => Promise<void>;
  /** Last result kept on screen after the seat is cleared. */
  settlement: Settlement | null;
  clearSettlement: () => void;
};

const Ctx = createContext<LobbyCtx | null>(null);
const COOLDOWN = 5000;

function viewOf(room: RoomSnap | null | undefined) {
  return (room?.view ?? null) as { phase?: string; street?: string } | null;
}

function isLobbyRoom(room: RoomSnap | null | undefined) {
  const view = viewOf(room);
  if (!room || !view) return false;
  return view.phase === "lobby" || view.street === "lobby";
}

/** Normal rules already produced a winner, a loss, or a draw. */
export function isGameOver(room: RoomSnap | null | undefined) {
  const view = viewOf(room);
  if (!room || !view) return false;
  if (room.game === "roulette" || room.game === "slots") return false;
  if (room.game === "holdem") return view.street === "over";
  return view.phase === "over";
}

/** Playing (not lobby wait, not settlement). Holdem uses street, not phase. */
function isLiveMatch(room: RoomSnap | null | undefined) {
  if (!room?.view) return false;
  if (room.game === "roulette" || room.game === "slots") return false;
  if (isLobbyRoom(room) || isGameOver(room)) return false;
  return true;
}

export function LobbyProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [snap, setSnap] = useState<LobbySnap>({ online: [], invites: [], room: null, store: "memory", queue: null });
  const [settlement, setSettlement] = useState<Settlement | null>(null);
  const [error, setError] = useState("");
  const [inviteUntil, setInviteUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const roomGame = useRef<string | null>(null);
  const roomSeq = useRef(0);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const leavingRef = useRef(false);
  /** Room id we already auto-left, so a repeated over payload does not leave twice. */
  const settledRoom = useRef<string | null>(null);
  /** Ignore stale watch payloads for a room we just left (prevents bounce back to settlement). */
  const dismissedRoomId = useRef<string | null>(null);

  function takeRoom(next: RoomSnap | null | undefined, prev: RoomSnap | null) {
    if (!next) return null;
    if (dismissedRoomId.current && next.id === dismissedRoomId.current) return null;
    const seq = next.seq ?? 0;
    if (seq && seq < roomSeq.current) return prev;
    if (seq) roomSeq.current = seq;
    return next;
  }

  function acceptRoom(room: RoomSnap | null | undefined) {
    if (!room) return;
    if (dismissedRoomId.current && room.id === dismissedRoomId.current) {
      dismissedRoomId.current = null;
    }
  }

  useEffect(() => {
    if (inviteUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [inviteUntil]);

  useEffect(() => {
    if (!token || !user) {
      setSnap({ online: [], invites: [], room: null, store: "memory", queue: null });
      setSettlement(null);
      roomSeq.current = 0;
      dismissedRoomId.current = null;
      settledRoom.current = null;
      return;
    }
    let stop = false;
    let timer = 0;
    let abort: AbortController | null = null;
    const applySnap = (next: LobbySnap) => {
      if (next.settlement?.game && next.settlement.view) setSettlement(next.settlement);
      setSnap((prev) => {
        const light = Boolean(next.light);
        let room = next.room ? takeRoom(next.room, prev.room) : null;
        if (room && dismissedRoomId.current && room.id === dismissedRoomId.current) room = null;
        if (!room) roomSeq.current = 0;
        return {
          online: light && !next.online.length ? prev.online : next.online,
          invites: next.invites,
          room,
          store: next.store || prev.store,
          queue: next.queue ?? null,
        };
      });
      setError("");
      const incoming = next.room && !(dismissedRoomId.current && next.room.id === dismissedRoomId.current) ? next.room : null;
      if (incoming?.game && incoming.game !== roomGame.current) {
        const path = GAME_PATH[incoming.game];
        if (path && window.location.pathname !== path) nav(path);
      }
      if (incoming) roomGame.current = incoming.game;
      else if (!next.room || (dismissedRoomId.current && next.room.id === dismissedRoomId.current)) {
        roomGame.current = null;
      }
    };
    let lastFull = 0;
    const tick = async () => {
      try {
        abort?.abort();
        abort = new AbortController();
        const inRoom = Boolean(snapRef.current.room);
        const queued = Boolean(snapRef.current.queue);
        if (document.hidden && !inRoom && !queued) {
          if (!stop) timer = window.setTimeout(tick, 20000);
          return;
        }
        const needRoster = !inRoom && Date.now() - lastFull > 20000;
        const next = needRoster
          ? await lobbyApi.sync(token, window.location.pathname, false)
          : await lobbyApi.watch(
              token,
              snapRef.current.room?.seq ?? 0,
              snapRef.current.invites.length,
              window.location.pathname,
              snapRef.current.queue?.waiting ?? 0,
              abort.signal,
            );
        if (stop) return;
        if (!next.light) lastFull = Date.now();
        applySnap(next);
        if (!stop) timer = window.setTimeout(tick, document.hidden && inRoom ? 4000 : 0);
      } catch (ex) {
        if (stop) return;
        if (ex instanceof Error && ex.name === "AbortError") return;
        setError(ex instanceof Error ? ex.message : "Lobby sync failed");
        if (!stop) timer = window.setTimeout(tick, 200);
      }
    };
    void tick();
    return () => {
      stop = true;
      abort?.abort();
      window.clearTimeout(timer);
    };
  }, [token, user, nav]);

  // Match already decided: show that result, drop the seat immediately. No extra wait.
  useEffect(() => {
    const room = snap.room;
    if (!token || !room || !isGameOver(room) || leavingRef.current) return;
    if (settledRoom.current === room.id) return;
    settledRoom.current = room.id;
    leavingRef.current = true;
    dismissedRoomId.current = room.id;
    roomSeq.current = 0;
    roomGame.current = null;
    setSettlement({ game: room.game, view: room.view });
    setSnap((prev) => ({ ...prev, room: null }));
    void lobbyApi
      .leave(token)
      .catch(() => {})
      .finally(() => {
        leavingRef.current = false;
      });
  }, [snap.room, token]);

  useEffect(() => {
    if (snap.room && !isGameOver(snap.room)) setSettlement(null);
  }, [snap.room]);

  useEffect(() => {
    setSettlement((cur) => {
      if (!cur) return cur;
      const path = GAME_PATH[cur.game];
      if (path && loc.pathname !== path) return null;
      return cur;
    });
  }, [loc.pathname]);

  // Navigate away mid-match → forfeit on the server. Do not bounce back onto the table.
  useEffect(() => {
    if (!token) return;
    const room = snap.room;
    if (!isLiveMatch(room)) return;
    const path = room?.game ? GAME_PATH[room.game] : "";
    if (!path || loc.pathname === path || leavingRef.current) return;
    leavingRef.current = true;
    const id = room!.id;
    dismissedRoomId.current = id;
    roomSeq.current = 0;
    void lobbyApi
      .leave(token)
      .then((next) => {
        setSnap({ ...next, room: null });
        roomGame.current = null;
      })
      .catch(() => {})
      .finally(() => {
        leavingRef.current = false;
      });
  }, [loc.pathname, token, snap.room]);

  useEffect(() => {
    if (!token) return;
    const onHide = (ev: PageTransitionEvent) => {
      if (ev.persisted) return;
      const room = snapRef.current.room;
      if (!isLiveMatch(room)) return;
      dismissedRoomId.current = room!.id;
      lobbyApi.leaveKeepalive(token);
      roomSeq.current = 0;
      setSnap((prev) => ({ ...prev, room: null, queue: null }));
      roomGame.current = null;
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [token]);

  async function unseat(): Promise<"forfeit" | "left" | "idle"> {
    if (!token) return "idle";
    const room = snapRef.current.room;
    if (!room || leavingRef.current) return "idle";
    const live = isLiveMatch(room);
    const over = isGameOver(room);
    const overView: Settlement | null = over ? { game: room.game, view: room.view } : null;
    leavingRef.current = true;
    dismissedRoomId.current = room.id;
    settledRoom.current = room.id;
    roomSeq.current = 0;
    roomGame.current = null;
    try {
      const next = await lobbyApi.leave(token);
      if (live && next.settlement) {
        setSettlement(next.settlement);
        setSnap({ ...next, room: null });
        return "forfeit";
      }
      if (overView) setSettlement(overView);
      setSnap({ ...next, room: null });
      return "left";
    } catch {
      if (live) {
        const prior = room.view;
        setSettlement({
          game: room.game,
          view: {
            ...(prior && typeof prior === "object" ? prior : {}),
            phase: "over",
            street: room.game === "holdem" ? "over" : (prior as { street?: string } | null)?.street,
            forfeit: true,
            message: "You left. You lose.",
          },
        });
        setSnap((prev) => ({ ...prev, room: null }));
        return "forfeit";
      }
      if (overView) setSettlement(overView);
      setSnap((prev) => ({ ...prev, room: null }));
      return "left";
    } finally {
      leavingRef.current = false;
    }
  }

  const value = useMemo<LobbyCtx>(
    () => ({
      online: snap.online,
      invites: snap.invites,
      room: snap.room,
      queue: snap.queue ?? null,
      settlement,
      clearSettlement() {
        setSettlement(null);
      },
      error,
      store: snap.store || "",
      inviteCooldownMs: Math.max(0, inviteUntil - now),
      async invite(toId, game, meta = {}) {
        if (!token) throw new Error("Sign in first");
        if (Date.now() < inviteUntil) throw new Error("Wait 5 seconds before inviting again");
        const next = await lobbyApi.invite(token, toId, game, meta);
        setInviteUntil(Date.now() + COOLDOWN);
        setSettlement(null);
        acceptRoom(next.room);
        setSnap((prev) => ({
          ...next,
          online: next.online?.length ? next.online : prev.online,
          room: takeRoom(next.room, prev.room),
          queue: next.queue ?? null,
        }));
      },
      async findMatch(game, meta = {}) {
        if (!token) throw new Error("Sign in first");
        dismissedRoomId.current = null;
        settledRoom.current = null;
        setSettlement(null);
        const next = await lobbyApi.queue(token, game, meta);
        acceptRoom(next.room);
        setSnap((prev) => ({
          ...next,
          online: next.online?.length ? next.online : prev.online,
          room: takeRoom(next.room, prev.room),
          queue: next.queue ?? null,
        }));
        if (next.room) {
          roomSeq.current = next.room.seq || roomSeq.current;
          const path = GAME_PATH[next.room.game];
          if (path) nav(path);
        }
      },
      async cancelMatch() {
        if (!token) return;
        const next = await lobbyApi.unqueue(token);
        setSnap((prev) => ({
          ...next,
          online: next.online?.length ? next.online : prev.online,
          room: takeRoom(next.room, prev.room),
          queue: next.queue ?? null,
        }));
      },
      async respond(id, accept) {
        if (!token) throw new Error("Sign in first");
        const next = await lobbyApi.respond(token, id, accept);
        if (accept && next.room) {
          setSettlement(null);
          acceptRoom(next.room);
        }
        setSnap((prev) => ({
          ...next,
          online: next.online?.length ? next.online : prev.online,
          room: next.room ? takeRoom(next.room, prev.room) : null,
          queue: next.queue ?? null,
        }));
        if (accept && next.room) {
          roomSeq.current = next.room.seq || roomSeq.current;
          const path = GAME_PATH[next.room.game];
          if (path) nav(path);
        }
      },
      async sendAction(action) {
        const roomId = snapRef.current.room?.id;
        if (!token || !roomId) return;
        const next = await lobbyApi.action(token, roomId, action);
        if (!next.room) return;
        setSnap((prev) => ({
          ...prev,
          room: takeRoom(next.room as RoomSnap, prev.room),
        }));
      },
      async adjustCpu(game, mode, meta = {}) {
        if (!token) throw new Error("Sign in first");
        // Opening / seating always accepts the returned table (ignore prior leave dismiss).
        if (mode === "open" || mode === "add" || mode === "fill") {
          dismissedRoomId.current = null;
          settledRoom.current = null;
          roomSeq.current = 0;
          setSettlement(null);
        }
        const next = await lobbyApi.cpu(token, game, mode, meta);
        acceptRoom(next.room);
        setSnap((prev) => ({
          ...next,
          online: next.online?.length ? next.online : prev.online,
          room: takeRoom(next.room as RoomSnap | null | undefined, prev.room),
          queue: next.queue ?? null,
        }));
      },
      async leave() {
        await unseat();
      },
      async leaveHome() {
        const live = isLiveMatch(snapRef.current.room);
        await unseat();
        if (live) return;
        setSettlement(null);
        nav("/");
      },
    }),
    [snap, settlement, error, token, nav, inviteUntil, now],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLobby() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("LobbyProvider missing");
  return ctx;
}
