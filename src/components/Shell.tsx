import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Avatar } from "./Avatar";
import { InviteToasts } from "./InviteToasts";

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <strong>Axiom</strong>
          <span>Play</span>
        </NavLink>
        <nav className="nav">
          <NavLink to="/play/davinci">Coda</NavLink>
          <NavLink to="/play/flip7">Flip 7</NavLink>
          <NavLink to="/play/blackjack">21</NavLink>
          <NavLink to="/play/24">24</NavLink>
          <NavLink to="/play/holdem">Hold’em</NavLink>
          <NavLink to="/play/uno">UNO</NavLink>
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
      <main>{children}</main>
      <footer className="foot">
        <span>Axiom</span>
        <span>Invite duels · GitHub</span>
      </footer>
    </div>
  );
}
