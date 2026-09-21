import { Link } from "react-router-dom";
import { MahjongTile } from "../components/MahjongTile";
import { FlipFace, MiniPoker, UnoFace } from "../components/PlayingCard";

const games = [
  {
    to: "/play/davinci",
    idx: "01",
    code: "CODA",
    name: "Da Vinci Code",
    blurb: "Black and white acrylic tiles. Choose a color to draw, then guess the numbers in your rival’s row.",
    preview: "coda" as const,
  },
  {
    to: "/play/flip7",
    idx: "02",
    code: "FLIP7",
    name: "Flip 7",
    blurb: "Number wreaths. Seven distinct values score a bonus. First to 200 wins.",
    preview: "flip" as const,
  },
  {
    to: "/play/blackjack",
    idx: "03",
    code: "BJ21",
    name: "Blackjack",
    blurb: "Head-to-head poker. The rival hole card stays down until they stand.",
    preview: "bj" as const,
  },
  {
    to: "/play/24",
    idx: "04",
    code: "M24",
    name: "Make 24",
    blurb: "Same four poker cards. First to make 24 scores.",
    preview: "m24" as const,
  },
  {
    to: "/play/holdem",
    idx: "05",
    code: "HOLD",
    name: "Texas Hold’em",
    blurb: "Heads-up Hold’em on a standard deck. Blinds, streets, showdown.",
    preview: "hold" as const,
  },
  {
    to: "/play/guandan",
    idx: "06",
    code: "GDAN",
    name: "Guandan",
    blurb: "Four players. Partners sit across. Two decks plus jokers.",
    preview: "gdan" as const,
  },
  {
    to: "/play/uno",
    idx: "07",
    code: "UNO",
    name: "UNO",
    blurb: "Classic four-color ovals. Empty your hand to win.",
    preview: "uno" as const,
  },
];

function Preview({ kind }: { kind: (typeof games)[number]["preview"] }) {
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
  if (kind === "m24" || kind === "hold" || kind === "gdan") {
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
  return (
    <div className="preview-row">
      <button className="m24-num" type="button" style={{ width: 52, height: 70, fontSize: 24 }}>
        8
      </button>
      <button className="m24-num" type="button" style={{ width: 52, height: 70, fontSize: 24 }}>
        3
      </button>
    </div>
  );
}

export function Home() {
  return (
    <div className="page">
      <section className="hero">
        <div>
          <p className="kicker">Seven tables · Invite play</p>
          <h1>Play on a quiet table.</h1>
          <p className="lede">
            Card art follows the physical decks. Practice against the CPU, or sign in and invite someone who is online.
          </p>
        </div>
        <div className="hero-stage" aria-hidden>
          <MiniPoker rank="Q" suit="S" />
          <UnoFace card={{ id: "h1", color: "red", kind: "number", value: 0 }} />
          <FlipFace card={{ id: "h2", kind: "number", value: 12 }} />
          <MahjongTile hide={false} tile={{ color: "black", value: 7, revealed: true }} />
          <UnoFace card={{ id: "h3", color: "blue", kind: "draw2" }} />
          <MahjongTile hide={false} tile={{ color: "white", value: "joker", revealed: true }} />
        </div>
      </section>
      <div className="game-grid">
        {games.map((g) => (
          <Link key={g.code} to={g.to} className="game-card">
            <div>
              <div className="idx">
                {g.idx} / {g.code}
              </div>
              <h2>{g.name}</h2>
              <p>{g.blurb}</p>
              <Preview kind={g.preview} />
            </div>
            <div className="enter">Open →</div>
          </Link>
        ))}
      </div>
      <p className="section-note">Practice needs no account. Duels are invite-only, two players.</p>
    </div>
  );
}
