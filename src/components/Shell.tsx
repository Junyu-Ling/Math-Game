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
  "/play/ttt": "ttt",
  "/play/c4": "c4",
  "/play/snake": "snake",
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

function NetStatus() {
  const { net, reconnect, dismissReconnect, returnToTable, declineReturn, askReconnect } = useLobby();
  const label =
    net.quality === "down" ? "Offline" : net.rtt == null ? "Checking" : `${net.rtt} ms`;
  const word = net.quality === "good" ? "Good" : net.quality === "fair" ? "Fair" : net.quality === "slow" ? "Slow" : "Offline";
  const openAsk = net.paused && !net.prompt;
  return (
    <>
      <button
        className={`net-pill ${net.quality}${openAsk ? " ask" : ""}`}
        type="button"
        title={openAsk ? "Connection paused. Click to reconnect." : `Network ${word}`}
        onClick={() => {
          if (openAsk) askReconnect();
        }}
      >
        <i className="net-dot" />
        <span>{label}</span>
        {net.quality === "down" ? null : <span className="net-word">{openAsk ? "Reconnect" : word}</span>}
      </button>
      {net.prompt ? (
        <div className="net-modal" role="dialog" aria-modal="true">
          <div className="net-card">
            {net.prompt === "reconnect" ? (
              <>
                <h2>Connection lost</h2>
                <p>Your seat is still at the table. Reconnect?</p>
                <div className="net-actions">
                  <button className="btn btn-go" type="button" disabled={net.reconnecting} onClick={() => void reconnect()}>
                    {net.reconnecting ? "Reconnecting…" : "Reconnect"}
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={dismissReconnect}>
                    Not now
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Connected again</h2>
                <p>
                  Return to this {net.tableLabel || "table"}? Play continues from where you left off.
                </p>
                <div className="net-actions">
                  <button className="btn btn-go" type="button" onClick={returnToTable}>
                    Return
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={declineReturn}>
                    Not yet
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
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
  const { user, logout, loading } = useAuth();
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
          ) : loading ? (
            <span className="nav-user">…</span>
          ) : (
            <NavLink to="/login">Log in</NavLink>
          )}
          <NetStatus />
        </nav>
      </header>
      <InviteToasts />
      <RotateGate />
      <main>{children}</main>
    </div>
  );
}
