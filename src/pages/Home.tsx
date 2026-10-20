import { Link } from "react-router-dom";
import { MahjongTile } from "../components/MahjongTile";
import { FlipFace, MiniPoker, UnoFace } from "../components/PlayingCard";
import { PlaneIcon } from "../games/ludo/LudoPage";

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
  // Deferred — Make 24
  // {
  //   to: "/play/24",
  //   idx: "04",
  //   code: "M24",
  //   name: "Make 24",
  //   blurb: "Same four poker cards. First to make 24 scores.",
  //   preview: "m24" as const,
  // },
  {
    to: "/play/holdem",
    idx: "05",
    code: "HOLD",
    name: "Texas Hold’em",
    blurb: "Heads-up Hold’em on a standard deck. Blinds, streets, showdown.",
    preview: "hold" as const,
  },
  {
    to: "/play/uno",
    idx: "06",
    code: "UNO",
    name: "UNO",
    blurb: "Classic four-color ovals. Empty your hand to win.",
    preview: "uno" as const,
  },
  {
    to: "/play/halli",
    idx: "07",
    code: "HALLI",
    name: "Halli Galli",
    blurb: "Flip fruit cards. When five of one fruit show, ring the bell first.",
    preview: "halli" as const,
  },
  {
    to: "/play/ecard",
    idx: "08",
    code: "ECARD",
    name: "E-Card",
    blurb: "Kaiji’s Emperor · Citizen · Slave. Psychological duel — Slave alone can kill the Emperor.",
    preview: "ecard" as const,
  },
  {
    to: "/play/gomoku",
    idx: "09",
    code: "GOMOKU",
    name: "Gomoku",
    blurb: "15×15. Place stones. First five in a row wins.",
    preview: "gomoku" as const,
  },
  // Deferred — Werewolf
  // {
  //   to: "/play/werewolf",
  //   idx: "10",
  //   code: "WOLF",
  //   name: "Werewolf",
  //   blurb: "Night kills, day votes. Werewolves, Seer, Witch, and villagers.",
  //   preview: "werewolf" as const,
  // },
  {
    to: "/play/roulette",
    idx: "11",
    code: "ROULETTE",
    name: "European Roulette",
    blurb: "Single-zero wheel 0–36. Solo bets vs the house — straight through even money.",
    preview: "roulette" as const,
  },
  {
    to: "/play/slots",
    idx: "12",
    code: "SLOTS",
    name: "Slot Machine",
    blurb: "Three-reel practice slots. Pick a bet, spin, and check the paytable.",
    preview: "slots" as const,
  },
  {
    to: "/play/ludo",
    idx: "13",
    code: "FLY",
    name: "Flying Chess",
    blurb: "Four planes each. Roll a 6 to take off, then race the colored track home.",
    preview: "ludo" as const,
  },
  // Deferred — Animal Chess / Army Chess
  // {
  //   to: "/play/animal",
  //   idx: "14",
  //   code: "ANIMAL",
  //   name: "Animal Chess",
  //   blurb: "Jungle ranks, rivers, and dens. Enter the rival den to win.",
  //   preview: "animal" as const,
  // },
  // {
  //   to: "/play/army",
  //   idx: "15",
  //   code: "ARMY",
  //   name: "Army Chess",
  //   blurb: "Open 军棋. Bombs, mines, and the flag. Capture 军旗 to win.",
  //   preview: "army" as const,
  // },
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
  // Deferred — Werewolf
  // if (kind === "werewolf") {
  //   return (
  //     <div className="preview-row">
  //       <span className="wolf-preview tone-wolf">W</span>
  //       <span className="wolf-preview tone-seer">S</span>
  //       <span className="wolf-preview tone-witch">K</span>
  //     </div>
  //   );
  // }
  if (kind === "roulette") {
    return (
      <div className="preview-row">
        <span className="roulette-preview" aria-hidden />
      </div>
    );
  }
  if (kind === "slots") {
    return (
      <div className="preview-row">
        <span className="slots-preview" aria-hidden>
          🍒 · 7 · ★
        </span>
      </div>
    );
  }
  if (kind === "ludo") {
    return (
      <div className="preview-row fly-preview">
        {(["blue", "red", "yellow", "green"] as const).map((c) => (
          <span key={c} className={`fly-mini ${c}`}>
            <PlaneIcon />
          </span>
        ))}
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
          <p className="kicker">Eleven tables · Invite play</p>
          <h1>Play on a quiet table.</h1>
          <p className="lede">
            Card art follows the physical decks. Practice against the CPU, or sign in and invite someone who is online.
          </p>
        </div>
        <div className="hero-stage" aria-hidden>
          <FlipFace card={{ id: "h1", kind: "number", value: 12 }} />
          <MahjongTile hide={false} tile={{ color: "white", value: "joker", revealed: true }} />
          <UnoFace card={{ id: "h2", color: "black", kind: "wild4" }} />
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
      <p className="section-note">Sign in to open a table, add CPUs or invite, then start. All games support online play.</p>
    </div>
  );
}
