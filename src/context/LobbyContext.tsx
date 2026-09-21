import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { GAME_PATH, lobbyApi, type Invite, type LobbySnap, type OnlinePlayer, type RoomSnap } from "../lib/lobby";

type LobbyCtx = {
  online: OnlinePlayer[];
  invites: Invite[];
  room: RoomSnap | null;
  error: string;
  invite: (toId: string, game: string, meta?: Record<string, unknown>) => Promise<void>;
  respond: (id: string, accept: boolean) => Promise<void>;
  sendAction: (action: object) => Promise<void>;
  leave: () => Promise<void>;
};

const Ctx = createContext<LobbyCtx | null>(null);

export function LobbyProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const nav = useNavigate();
  const [snap, setSnap] = useState<LobbySnap>({ online: [], invites: [], room: null });
  const [error, setError] = useState("");
  const roomGame = useRef<string | null>(null);

  useEffect(() => {
    if (!token || !user) {
      setSnap({ online: [], invites: [], room: null });
      return;
    }
    let stop = false;
    const tick = async () => {
      try {
        const next = await lobbyApi.sync(token, window.location.pathname);
        if (stop) return;
        setSnap(next);
        setError("");
        const g = next.room?.game || null;
        if (g && g !== roomGame.current) {
          const path = GAME_PATH[g];
          if (path && window.location.pathname !== path) nav(path);
        }
        roomGame.current = g;
      } catch (ex) {
        if (!stop) setError(ex instanceof Error ? ex.message : "大厅同步失败");
      }
    };
    void tick();
    const id = window.setInterval(tick, 2000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [token, user, nav]);

  const value = useMemo<LobbyCtx>(
    () => ({
      online: snap.online,
      invites: snap.invites,
      room: snap.room,
      error,
      async invite(toId, game, meta = {}) {
        if (!token) throw new Error("请先登录");
        const next = await lobbyApi.invite(token, toId, game, meta);
        setSnap(next);
      },
      async respond(id, accept) {
        if (!token) throw new Error("请先登录");
        const next = await lobbyApi.respond(token, id, accept);
        setSnap(next);
        if (accept && next.room) {
          const path = GAME_PATH[next.room.game];
          if (path) nav(path);
        }
      },
      async sendAction(action) {
        if (!token || !snap.room) return;
        const next = await lobbyApi.action(token, snap.room.id, action);
        setSnap(next);
      },
      async leave() {
        if (!token) return;
        const next = await lobbyApi.leave(token);
        setSnap(next);
      },
    }),
    [snap, error, token, nav],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLobby() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("LobbyProvider missing");
  return ctx;
}
