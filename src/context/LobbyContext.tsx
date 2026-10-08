import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { GAME_PATH, lobbyApi, type Invite, type LobbySnap, type OnlinePlayer, type RoomSnap } from "../lib/lobby";

type LobbyCtx = {
  online: OnlinePlayer[];
  invites: Invite[];
  room: RoomSnap | null;
  error: string;
  store: "redis" | "memory" | "";
  inviteCooldownMs: number;
  invite: (toId: string, game: string, meta?: Record<string, unknown>) => Promise<void>;
  respond: (id: string, accept: boolean) => Promise<void>;
  sendAction: (action: object) => Promise<void>;
  adjustCpu: (game: string, mode: "add" | "remove" | "fill" | "open", meta?: Record<string, unknown>) => Promise<void>;
  leave: () => Promise<void>;
};

const Ctx = createContext<LobbyCtx | null>(null);
const COOLDOWN = 5000;

function roomPhase(room: RoomSnap | null | undefined) {
  const view = room?.view as { phase?: string } | undefined;
  return view?.phase || "";
}

export function LobbyProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [snap, setSnap] = useState<LobbySnap>({ online: [], invites: [], room: null, store: "memory" });
  const [error, setError] = useState("");
  const [inviteUntil, setInviteUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const roomGame = useRef<string | null>(null);
  const roomSeq = useRef(0);
  const snapRef = useRef(snap);
  snapRef.current = snap;
  const leavingRef = useRef(false);

  function takeRoom(next: RoomSnap | null | undefined, prev: RoomSnap | null) {
    if (!next) return null;
    const seq = next.seq ?? 0;
    if (seq && seq < roomSeq.current) return prev;
    if (seq) roomSeq.current = seq;
    return next;
  }

  useEffect(() => {
    if (inviteUntil <= Date.now()) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [inviteUntil]);

  useEffect(() => {
    if (!token || !user) {
      setSnap({ online: [], invites: [], room: null, store: "memory" });
      roomSeq.current = 0;
      return;
    }
    let stop = false;
    let timer = 0;
    let abort: AbortController | null = null;
    const applySnap = (next: LobbySnap) => {
      setSnap((prev) => {
        const light = Boolean(next.light);
        // Server always sends `room` (object or null). Null means left / table closed.
        const room = next.room ? takeRoom(next.room, prev.room) : null;
        if (!room) roomSeq.current = 0;
        return {
          online: light && !next.online.length ? prev.online : next.online,
          invites: next.invites,
          room,
          store: next.store || prev.store,
        };
      });
      setError("");
      if (next.room?.game && next.room.game !== roomGame.current) {
        const path = GAME_PATH[next.room.game];
        if (path && window.location.pathname !== path) nav(path);
      }
      if (next.room) roomGame.current = next.room.game;
      else roomGame.current = null;
    };
    let lastFull = 0;
    const tick = async () => {
      try {
        abort?.abort();
        abort = new AbortController();
        const inRoom = Boolean(snapRef.current.room);
        // Keep heartbeats while seated even if the tab is hidden, so leave detection stays honest.
        if (document.hidden && !inRoom) {
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

  // Leaving the game route mid-match (or closing the tab) ends the table for everyone.
  useEffect(() => {
    if (!token) return;
    const room = snap.room;
    const phase = roomPhase(room);
    const path = room?.game ? GAME_PATH[room.game] : "";
    const active = Boolean(room && phase && phase !== "lobby");
    if (active && path && loc.pathname !== path && !leavingRef.current) {
      leavingRef.current = true;
      roomSeq.current = 0;
      void lobbyApi
        .leave(token)
        .then((next) => {
          setSnap(next);
          roomGame.current = null;
        })
        .catch(() => {})
        .finally(() => {
          leavingRef.current = false;
        });
    }
  }, [loc.pathname, token, snap.room]);

  useEffect(() => {
    if (!token) return;
    const onHide = (ev: PageTransitionEvent) => {
      if (ev.persisted) return;
      const room = snapRef.current.room;
      const phase = roomPhase(room);
      if (!room || !phase || phase === "lobby" || phase === "over") return;
      lobbyApi.leaveKeepalive(token);
      roomSeq.current = 0;
      setSnap((prev) => ({ ...prev, room: null }));
      roomGame.current = null;
    };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, [token]);

  const value = useMemo<LobbyCtx>(
    () => ({
      online: snap.online,
      invites: snap.invites,
      room: snap.room,
      error,
      store: snap.store || "",
      inviteCooldownMs: Math.max(0, inviteUntil - now),
      async invite(toId, game, meta = {}) {
        if (!token) throw new Error("Sign in first");
        if (Date.now() < inviteUntil) throw new Error("Wait 5 seconds before inviting again");
        const next = await lobbyApi.invite(token, toId, game, meta);
        setInviteUntil(Date.now() + COOLDOWN);
        setSnap((prev) => ({
          ...next,
          online: next.online?.length ? next.online : prev.online,
          room: takeRoom(next.room, prev.room),
        }));
      },
      async respond(id, accept) {
        if (!token) throw new Error("Sign in first");
        const next = await lobbyApi.respond(token, id, accept);
        setSnap((prev) => ({
          ...next,
          online: next.online?.length ? next.online : prev.online,
          room: next.room ? takeRoom(next.room, prev.room) : next.room ?? prev.room,
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
        const next = await lobbyApi.cpu(token, game, mode, meta);
        setSnap((prev) => ({
          ...next,
          online: next.online?.length ? next.online : prev.online,
          room: takeRoom(next.room, prev.room),
        }));
      },
      async leave() {
        if (!token) return;
        roomSeq.current = 0;
        const next = await lobbyApi.leave(token);
        setSnap(next);
      },
    }),
    [snap, error, token, nav, inviteUntil, now],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLobby() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("LobbyProvider missing");
  return ctx;
}
