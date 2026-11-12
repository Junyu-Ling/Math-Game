import { Link } from "react-router-dom";
import { MahjongTile } from "../components/MahjongTile";
import { FlipFace, MiniPoker, UnoFace } from "../components/PlayingCard";
import { SlotGlyph } from "../games/slots/SlotsPage";
import type { SymbolId } from "../games/slots/engine";
import {
  MATH_WEEK,
  STEAM_WEEK,
  gamesFor,
  isWeekOpen,
  type CatalogGame,
  type CatalogPreview,
} from "../lib/weeks";

const SLOT_PREVIEW: SymbolId[] = ["cherry", "seven", "bar", "wild", "lemon", "bell", "orange", "plum"];

const WEEK_SECTIONS = [
  { week: "steam" as const, title: `${STEAM_WEEK.label} · ${STEAM_WEEK.dates}` },
  { week: "math" as const, title: `${MATH_WEEK.label} · ${MATH_WEEK.dates}` },
];

function Preview({ kind }: { kind: CatalogPreview }) {
  if (kind === "coda") {
    return (
      <div className="preview-row">
        <MahjongTile mini hide={false} tile={{ color: "black", value: 2, revealed: true }} />
        <MahjongTile mini hide={false} tile={{ color: "white", value: 5, revealed: true }} />
        <MahjongTile mini hide={false} tile={{ color: "white", value: "joker", revealed: true }} />
      </div>
    );
  }
  if (kind === "flip") {
    return (
      <div className="preview-row">
        <FlipFace card={{ id: "p1", kind: "number", value: 7 }} />
        <FlipFace card={{ id: "p2", kind: "freeze" }} />
      </div>
    );
  }
  if (kind === "bj") {
    return (
      <div className="preview-row">
        <MiniPoker rank="A" suit="S" />
        <MiniPoker rank="K" suit="H" />
      </div>
    );
  }
  if (kind === "hold") {
    return (
      <div className="preview-row">
        <MiniPoker rank="A" suit="S" />
        <MiniPoker rank="K" suit="H" />
        <MiniPoker rank="7" suit="D" />
      </div>
    );
  }
  if (kind === "uno") {
    return (
      <div className="preview-row">
        <UnoFace card={{ id: "u1", color: "red", kind: "number", value: 7 }} />
        <UnoFace card={{ id: "u2", color: "yellow", kind: "skip" }} />
        <UnoFace card={{ id: "u3", color: "black", kind: "wild4" }} />
      </div>
    );
  }
  if (kind === "halli") {
    return (
      <div className="preview-row">
        <div className="hg-card fruit-cherry mini" aria-hidden>
          <div className="hg-card-inner">
            <span className="hg-fruit">🍒</span>
            <span className="hg-fruit">🍒</span>
            <span className="hg-fruit">🍒</span>
          </div>
        </div>
        <div className="hg-card fruit-banana mini" aria-hidden>
          <div className="hg-card-inner">
            <span className="hg-fruit">🍌</span>
            <span className="hg-fruit">🍌</span>
          </div>
        </div>
        <div className="hg-card fruit-lemon mini" aria-hidden>
          <div className="hg-card-inner">
            <span className="hg-fruit">🍋</span>
          </div>
        </div>
      </div>
    );
  }
  if (kind === "ecard") {
    return (
      <div className="preview-row preview-ecard">
        <img src="/ecard-emperor.png" alt="Emperor" />
        <img src="/ecard-citizen.png" alt="Citizen" />
        <img src="/ecard-slave.png" alt="Slave" />
      </div>
    );
  }
  if (kind === "gomoku") {
    return (
      <div className="preview-row preview-scene-row">
        <div className="home-preview home-preview-gomoku" aria-hidden>
          <svg viewBox="0 0 120 78" className="home-preview-svg">
            <defs>
              <radialGradient id="gomo-b" cx="35%" cy="30%" r="65%">
                <stop offset="0%" stopColor="#555" />
                <stop offset="55%" stopColor="#1a1a1a" />
                <stop offset="100%" stopColor="#050505" />
              </radialGradient>
              <radialGradient id="gomo-w" cx="35%" cy="30%" r="65%">
                <stop offset="0%" stopColor="#fff" />
                <stop offset="70%" stopColor="#ece6dc" />
                <stop offset="100%" stopColor="#cfc6b8" />
              </radialGradient>
            </defs>
            {[18, 30, 42, 54, 66, 78, 90, 102].map((x) => (
              <line key={`vx${x}`} x1={x} y1="14" x2={x} y2="64" stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="0.9" />
            ))}
            {[18, 30, 42, 54].map((y) => (
              <line key={`hy${y}`} x1="18" y1={y} x2="102" y2={y} stroke="#94a3b8" strokeOpacity="0.55" strokeWidth="0.9" />
            ))}
            {[
              [42, 30],
              [54, 30],
              [66, 30],
              [78, 30],
              [90, 30],
            ].map(([cx, cy], i) => (
              <circle key={`b${i}`} cx={cx} cy={cy} r="7.2" fill="url(#gomo-b)" />
            ))}
            <circle cx="66" cy="42" r="7.2" fill="url(#gomo-w)" stroke="#b8aea0" strokeWidth="0.6" />
            <circle cx="54" cy="54" r="7.2" fill="url(#gomo-w)" stroke="#b8aea0" strokeWidth="0.6" />
          </svg>
        </div>
      </div>
    );
  }
  if (kind === "ttt") {
    return (
      <div className="preview-row preview-scene-row">
        <div className="home-preview home-preview-ttt" aria-hidden>
          <svg viewBox="0 0 120 78" className="home-preview-svg">
            <line x1="46" y1="12" x2="46" y2="66" stroke="#94a3b8" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="74" y1="12" x2="74" y2="66" stroke="#94a3b8" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="26" y1="30" x2="94" y2="30" stroke="#94a3b8" strokeWidth="2.4" strokeLinecap="round" />
            <line x1="26" y1="48" x2="94" y2="48" stroke="#94a3b8" strokeWidth="2.4" strokeLinecap="round" />
            <g stroke="#0f172a" strokeWidth="3.2" strokeLinecap="round">
              <line x1="28" y1="14" x2="42" y2="26" />
              <line x1="42" y1="14" x2="28" y2="26" />
            </g>
            <circle cx="60" cy="39" r="7.5" fill="none" stroke="#dc2626" strokeWidth="3" />
            <g stroke="#0f172a" strokeWidth="3.2" strokeLinecap="round">
              <line x1="80" y1="52" x2="94" y2="64" />
              <line x1="94" y1="52" x2="80" y2="64" />
            </g>
            <circle cx="32" cy="57" r="7.5" fill="none" stroke="#dc2626" strokeWidth="3" />
          </svg>
        </div>
      </div>
    );
  }
  if (kind === "c4") {
    return (
      <div className="preview-row preview-scene-row">
        <div className="home-preview home-preview-c4" aria-hidden>
          <svg viewBox="0 0 120 78" className="home-preview-svg">
            <defs>
              <radialGradient id="c4-red" cx="32%" cy="28%" r="70%">
                <stop offset="0%" stopColor="#fca5a5" />
                <stop offset="55%" stopColor="#dc2626" />
                <stop offset="100%" stopColor="#7f1d1d" />
              </radialGradient>
              <radialGradient id="c4-yel" cx="32%" cy="28%" r="70%">
                <stop offset="0%" stopColor="#fde68a" />
                <stop offset="55%" stopColor="#eab308" />
                <stop offset="100%" stopColor="#854d0e" />
              </radialGradient>
            </defs>
            {[0, 1, 2, 3, 4].flatMap((col) =>
              [0, 1, 2, 3].map((row) => {
                const cx = 28 + col * 16;
                const cy = 18 + row * 13;
                const filled = (col === 1 && row >= 2) || (col === 2 && row >= 1) || (col === 3 && row >= 2);
                const red = (col === 1 && row === 3) || (col === 2 && row !== 2) || (col === 3 && row === 3);
                return (
                  <g key={`${col}-${row}`}>
                    <circle cx={cx} cy={cy} r="5.6" fill="none" stroke="#2563eb" strokeWidth="1.6" />
                    {filled ? <circle cx={cx} cy={cy} r="4.6" fill={red ? "url(#c4-red)" : "url(#c4-yel)"} /> : null}
                  </g>
                );
              }),
            )}
          </svg>
        </div>
      </div>
    );
  }
  if (kind === "snake") {
    return (
      <div className="preview-row preview-scene-row">
        <div className="home-preview home-preview-snake" aria-hidden>
          <svg viewBox="0 0 120 78" className="home-preview-svg">
            <defs>
              <linearGradient id="snake-body" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#0f766e" />
                <stop offset="55%" stopColor="#14b8a6" />
                <stop offset="100%" stopColor="#5eead4" />
              </linearGradient>
            </defs>
            <path d="M18 52 C28 52 32 28 48 28 S72 52 86 40" fill="none" stroke="url(#snake-body)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="86" cy="40" r="7" fill="#2dd4bf" />
            <circle cx="88.5" cy="38" r="1.6" fill="#0f172a" />
            <circle cx="102" cy="28" r="4.2" fill="#fbbf24" />
            <circle cx="100.8" cy="26.8" r="1.3" fill="#fff7d6" opacity="0.85" />
            <circle cx="34" cy="58" r="2.2" fill="#f59e0b" opacity="0.7" />
            <circle cx="58" cy="62" r="1.8" fill="#fbbf24" opacity="0.55" />
          </svg>
        </div>
      </div>
    );
  }
  if (kind === "wolf") {
    return (
      <div className="preview-row">
        <span className="wolf-preview tone-wolf">W</span>
        <span className="wolf-preview tone-seer">S</span>
        <span className="wolf-preview tone-witch">K</span>
        <span className="wolf-preview tone-villager">V</span>
      </div>
    );
  }
  if (kind === "roulette") {
    return (
      <div className="preview-row">
        <span className="roulette-preview" aria-hidden />
      </div>
    );
  }
  return (
    <div className="preview-row slots-home-preview">
      {SLOT_PREVIEW.map((sym) => (
        <span key={sym} className="slots-home-glyph" aria-hidden>
          <SlotGlyph sym={sym} />
        </span>
      ))}
    </div>
  );
}

function GameTile({ game }: { game: CatalogGame }) {
  const open = isWeekOpen(game.week);
  const body = (
    <>
      <div>
        <div className="idx">
          {game.idx} / {game.code}
        </div>
        <h2>{game.name}</h2>
        <p>{game.blurb}</p>
        <Preview kind={game.preview} />
      </div>
      <div className="enter">{open ? "Open →" : "MATH WEEK →"}</div>
    </>
  );
  if (!open) {
    return (
      <div className="game-card is-soon" aria-disabled="true">
        {body}
      </div>
    );
  }
  return (
    <Link to={game.to} className="game-card">
      {body}
    </Link>
  );
}

export function Home() {
  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="kicker">
            {STEAM_WEEK.label} · {STEAM_WEEK.dates}
          </p>
          <h1>Play on a quiet table.</h1>
          <p className="lede">
            Every table is open. STEAM Week and MATH Week stay in two lists so you can find them later.
          </p>
        </div>
        <div className="hero-stage" aria-hidden>
          <FlipFace card={{ id: "h1", kind: "number", value: 12 }} />
          <MahjongTile hide={false} tile={{ color: "white", value: "joker", revealed: true }} />
          <UnoFace card={{ id: "h3", color: "black", kind: "wild4" }} />
        </div>
      </section>
      {WEEK_SECTIONS.map((section) => (
        <section key={section.week} className="game-section" aria-label={section.title}>
          <p className="kicker">{section.title}</p>
          <div className="game-grid">
            {gamesFor(section.week).map((g) => (
              <GameTile key={g.code} game={g} />
            ))}
          </div>
        </section>
      ))}
      <p className="section-note">
        Every table is open. Sign in to invite someone, or practice vs CPU. STEAM Week and MATH Week stay listed
        separately.
      </p>
    </div>
  );
}
