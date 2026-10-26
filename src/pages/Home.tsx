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
      <div className="preview-row">
        <span className="gomoku-stone black" style={{ position: "relative", width: 28, height: 28, display: "inline-block" }} />
        <span className="gomoku-stone white" style={{ position: "relative", width: 28, height: 28, display: "inline-block" }} />
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
            Eight tables are open for STEAM Week — cards, stones, wolves, no-limit Hold’em, and the wheel. Number games
            wait for MATH WEEK.
          </p>
        </div>
        <div className="hero-stage" aria-hidden>
          <UnoFace card={{ id: "h1", color: "red", kind: "number", value: 7 }} />
          <UnoFace card={{ id: "h2", color: "yellow", kind: "skip" }} />
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
        STEAM Week tables are open now — including Werewolf, Hold’em, roulette, and slots. Sign in to invite someone, or
        practice vs CPU. MATH WEEK keeps Da Vinci, Flip 7, and Blackjack until that week starts.
      </p>
    </div>
  );
}
