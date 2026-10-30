import { useEffect, useRef, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GAME_LABEL, GAME_PATH } from "../lib/lobby";
import { useLobby } from "../context/LobbyContext";
import { usePlayMeta } from "../lib/playMeta";
import { Avatar } from "./Avatar";
import { InvitePanel } from "./InvitePanel";
import { InviteToasts } from "./InviteToasts";
import { RotateGate } from "./RotateGate";

const GAME_BY_PATH: Record<string, string> = {
  "/play/davinci": "coda",
  "/play/flip7": "flip7",
  "/play/blackjack": "bj",
  "/play/holdem": "holdem",
  "/play/uno": "uno",
  "/play/halli": "halli",
  "/play/ecard": "ecard",
  "/play/gomoku": "gomoku",
  // Deferred — Flying Chess
  // "/play/ludo": "ludo",
  "/play/24": "m24",
  // Deferred — Werewolf
  // "/play/werewolf": "werewolf",
  "/play/animal": "animal",
  "/play/army": "army",
};

function NavInvite() {
  const { pathname } = useLocation();
  const game = GAME_BY_PATH[pathname];
  const meta = usePlayMeta();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!game) return null;
  return (
    <div className="nav-invite" ref={rootRef}>
      <button className="linkish" type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        Invite
      </button>
      {open ? (
        <div className="nav-invite-panel">
          <InvitePanel game={game} meta={meta} />
        </div>
      ) : null}
    </div>
  );
}

function NavMatch() {
  const { queue } = useLobby();
  if (!queue) return null;
  const label = GAME_LABEL[queue.game] || queue.game;
  const path = GAME_PATH[queue.game];
  if (!path) return <span>Matching</span>;
  return (
    <NavLink to={path} title={`Matching ${label}`}>
      Matching
    </NavLink>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <strong>ByteGame</strong>
          <span>Play</span>
        </NavLink>
        <nav className="nav">
          <NavInvite />
          <NavMatch />
          {user ? (
            <>
              <span className="chip-pill">{user.chips}</span>
              <NavLink to="/account" title={user.email} className="nav-user">
                <Avatar src={user.avatar} name={user.login || user.name || user.email} size={22} />
                {user.login || user.name || user.email.split("@")[0]}
              </NavLink>
              <button className="linkish" type="button" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <NavLink to="/login">Log in</NavLink>
          )}
        </nav>
      </header>
      <InviteToasts />
      <RotateGate />
      <main>{children}</main>
    </div>
  );
}
