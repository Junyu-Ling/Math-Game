import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  return (
    <div className="shell">
      <header className="topbar">
        <NavLink to="/" className="brand">
          <strong>AXIOM</strong>
          <span>TABLE</span>
        </NavLink>
        <nav className="nav">
          <NavLink to="/play/davinci">CODA</NavLink>
          <NavLink to="/play/flip7">FLIP7</NavLink>
          <NavLink to="/play/blackjack">BJ21</NavLink>
          <NavLink to="/play/24">M24</NavLink>
          {user ? (
            <>
              <span className="chip-pill">{user.chips} CHIPS</span>
              <NavLink to="/account" title={user.email}>
                {user.login || user.name || user.email.split("@")[0]}
              </NavLink>
              <button className="linkish" type="button" onClick={logout}>
                OUT
              </button>
            </>
          ) : (
            <NavLink to="/login">LOGIN</NavLink>
          )}
        </nav>
      </header>
      <main>{children}</main>
      <footer className="foot">
        <span>AXIOM / GITHUB AUTH</span>
        <span>NO SUPABASE · REDIS OPTIONAL</span>
      </footer>
    </div>
  );
}
