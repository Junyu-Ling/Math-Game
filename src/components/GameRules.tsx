import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { MahjongTile } from "./MahjongTile";
import { FlipFace, PokerFace, UnoFace } from "./PlayingCard";
import { cardArt, cardLabel } from "../games/ecard/engine";
import type { EKind } from "../games/ecard/engine";
import { HALLI_EMOJI, type HalliFruit } from "../games/halligalli/engine";
import type { FlipCard } from "../games/flip7/engine";
import type { UnoCard } from "../games/uno/engine";
import type { PokerCard, Rank, Suit } from "../lib/poker";

const RULES: Record<string, string[]> = {
  coda: [
    "2–4 players. Each player picks their own black/white opening mix, then ready. The deal waits until everyone is ready.",
    "On your draw, pick black or white. You cannot draw a color that is gone.",
    "Each color has 0–11 plus one dash. The dash is shuffled in with the numbers, so it is not guaranteed in the opening hand.",
    "The veil is opening-only. Inserts wait the full 5 seconds even after you pick a slot.",
    "After the opening deal, two players play rock-paper-scissors and the loser guesses first. With 3 or 4, a random player draws first.",
    "When the deck is empty, play continues. Skip the draw and guess. A hit lets you guess again or end the turn. A miss knocks down one of your own hidden tiles.",
  ],
  flip7: [
    "2+ players, or Practice Solo alone. On your turn flip one card or stay to bank the round. Hitting 200 does not win mid-round. After the round, the highest score of 200 or more wins. A tie at the top plays another round. If someone leaves, they lose and the others keep playing.",
    "Practice Solo does not end at 200. Drawing the last card stays that round, and the next round deals a new deck. Freeze and Flip Three are played on yourself. The record lists number cards each round, the average number sum when a duplicate is drawn, and how often a finished round is Flip 7. A Second Chance save is marked as a bust too, so that round can count twice.",
    "Duplicate number busts you unless you hold Second Chance (passive — discards with the duplicate; one per player).",
    "Seven different numbers in your area is Flip 7: bank immediately with an extra +15.",
    "Freeze and Flip Three can target any active player, including yourself. Last active player must use them on themselves.",
    "Freeze banks that player’s round score. Flip Three makes that player flip three cards immediately — they do not wait for their turn. Bust or Flip 7 stops the rest.",
  ],
  uno: [
    "2–4 players. Match color or number/symbol. Empty your hand to win.",
    "When you have no legal play, draw one card only. If it is playable you may play it or keep it; you cannot draw again.",
    "Before playing down to one card (or your last card), tap UNO first.",
    "+2 can be stacked with +2 or +4; +4 can only be stacked with +4. Draw totals add up. Wilds pick the next color.",
  ],
  halli: [
    "2–4 players. Flip one fruit card on your turn.",
    "When five of the same fruit are showing across the table, ring first to take those cards.",
    "Ring too early and you pay cards into the deck. Last player with cards or first to the score goal wins.",
  ],
  bj: [
    "Heads-up. Closest to 21 without going over wins the hand.",
    "Hit or stand. The rival hole card stays hidden until they stand or bust.",
  ],
  m24: [
    "Same four poker cards for both players. Build an expression that equals 24.",
    "Use each card once. First correct answer scores.",
  ],
  ecard: [
    "Heads-up. Open a table, add a CPU or invite one friend, then start. RPS winner picks the opening side. 12 rounds in 4 sets of 3; roles swap every 3.",
    "Emperor: E + 4C. Slave: S + 4C. Emperor beats Citizen +1 and the Emperor card returns, so the round continues. Citizen vs Citizen +0, both leave. Citizen beats Slave +1 and the round ends. Slave beats Emperor +5 and the round ends — the Emperor was played on the Slave, so it is not returned.",
    "After a round, reclaim all cards. Highest score after 12 rounds wins.",
  ],
  gomoku: [
    "15×15. Open a table, add a CPU or invite, then start. Rock-paper-scissors: winner plays black. First exact five in a row wins.",
    "Black fouls: double live three (two live threes), double live four (two live fours with both ends open), or overline (six+). A blocked line is not live — sleeping threes and rush fours do not count. Exact five wins. White has no fouls.",
  ],
  ludo: [
    "2–4 players. Each color has four planes. Practice is you (blue) plus 1–3 CPUs.",
    "Roll a die. A 6 takes one plane from the hangar onto your ready square, or moves a plane 6 steps. A 6 gives another roll, up to three sixes; the third six still moves, then the turn passes.",
    "Move counter-clockwise on the shared track, then along your own colored home stretch. You need an exact roll to land on the center. First to bring all four planes home wins.",
    "Landing on one opponent plane sends it back to its hangar. Two or more of your own planes on a square stack into a block — opponents cannot land there, but they can move past it. Each plane still moves on its own.",
    "Colored dotted lines are fly shortcuts. Land exactly on your color’s arrow at the start of the line and you jump to the far end, closer to home. Passing over that square does not jump. Other colors cannot use your line.",
  ],
  animal: [
    "Dou Shou Qi on a 7×9 board with rivers, traps, and dens.",
    "Higher rank captures lower. Rat beats Elephant; Elephant cannot eat Rat. Lions/Tigers jump rivers. Enter the rival den to win.",
  ],
  army: [
    "Simplified open 军棋. Higher rank wins clashes; equal ranks both fall.",
    "Bomb trades with anything. Only Engineer clears mines. Capture the rival 军旗 to win.",
  ],
  werewolf: [
    "4–8 players. Roles: Werewolf(s), Villager, Seer, Witch. Night: wolves kill, Seer checks one, Witch may save and/or poison once each.",
    "Dawn shows who died. Day vote eliminates one. Wolves win if they equal or outnumber the living village; village wins when all wolves are dead.",
    "Simplified party rules — no Hunter, Guard, or speech timer. Practice is you plus 3–7 CPUs.",
  ],
  roulette: [
    "Solo European roulette (single zero 0–36) against the house. One bet per spin — a new click replaces the last stake.",
    "You pick the box. The house pays ⌊36 ÷ n⌋ − 1, where n is how many pockets that bet covers (a single number 35:1, a dozen 2:1, even money 1:1).",
    "Win returns stake plus that profit. 0 loses even-money outside bets; a straight on 0 can still win.",
  ],
  slots: [
    "Solo 3-reel practice slots. One payline. Set bet size, then spin.",
    "WILD substitutes on three-of-a-kind. Paytable (× bet): 7s ×80 · WILD ×50 · BAR ×40 · Bell ×25 · Plum ×15 · Orange ×12 · Lemon ×10 · Cherry ×8 · two Cherries ×2.",
    "Fixed fun paytable — not calibrated casino RTP. Practice chips sync to your account when signed in.",
  ],
};

type Sample = { rank: Rank; suit: Suit };

const HOLDEM_RANKS: Array<{ name: string; tip: string; cards: Sample[] }> = [
  {
    name: "Royal flush",
    tip: "A–10 same suit — the top hand.",
    cards: [
      { rank: "A", suit: "S" },
      { rank: "K", suit: "S" },
      { rank: "Q", suit: "S" },
      { rank: "J", suit: "S" },
      { rank: "10", suit: "S" },
    ],
  },
  {
    name: "Straight flush",
    tip: "Five in a row, same suit.",
    cards: [
      { rank: "9", suit: "H" },
      { rank: "8", suit: "H" },
      { rank: "7", suit: "H" },
      { rank: "6", suit: "H" },
      { rank: "5", suit: "H" },
    ],
  },
  {
    name: "Four of a kind",
    tip: "Four cards of one rank.",
    cards: [
      { rank: "K", suit: "C" },
      { rank: "K", suit: "D" },
      { rank: "K", suit: "H" },
      { rank: "K", suit: "S" },
      { rank: "2", suit: "D" },
    ],
  },
  {
    name: "Full house",
    tip: "Three of a kind + a pair. Beats trips.",
    cards: [
      { rank: "A", suit: "S" },
      { rank: "A", suit: "H" },
      { rank: "A", suit: "D" },
      { rank: "8", suit: "C" },
      { rank: "8", suit: "S" },
    ],
  },
  {
    name: "Flush",
    tip: "Five same suit, not in sequence.",
    cards: [
      { rank: "A", suit: "D" },
      { rank: "J", suit: "D" },
      { rank: "9", suit: "D" },
      { rank: "6", suit: "D" },
      { rank: "3", suit: "D" },
    ],
  },
  {
    name: "Straight",
    tip: "Five in a row, mixed suits. A-5 lowest; 10-A highest.",
    cards: [
      { rank: "10", suit: "C" },
      { rank: "9", suit: "D" },
      { rank: "8", suit: "S" },
      { rank: "7", suit: "H" },
      { rank: "6", suit: "C" },
    ],
  },
  {
    name: "Three of a kind",
    tip: "Three cards of one rank.",
    cards: [
      { rank: "7", suit: "S" },
      { rank: "7", suit: "H" },
      { rank: "7", suit: "D" },
      { rank: "K", suit: "C" },
      { rank: "2", suit: "S" },
    ],
  },
  {
    name: "Two pair",
    tip: "Two different pairs + a kicker.",
    cards: [
      { rank: "A", suit: "S" },
      { rank: "A", suit: "D" },
      { rank: "5", suit: "C" },
      { rank: "5", suit: "H" },
      { rank: "K", suit: "S" },
    ],
  },
  {
    name: "One pair",
    tip: "Two cards of one rank.",
    cards: [
      { rank: "Q", suit: "H" },
      { rank: "Q", suit: "C" },
      { rank: "A", suit: "S" },
      { rank: "9", suit: "D" },
      { rank: "4", suit: "C" },
    ],
  },
  {
    name: "High card",
    tip: "Nothing else — highest card wins (then kickers).",
    cards: [
      { rank: "A", suit: "S" },
      { rank: "J", suit: "D" },
      { rank: "8", suit: "C" },
      { rank: "6", suit: "H" },
      { rank: "2", suit: "S" },
    ],
  },
];

function sampleCard(rank: Rank, suit: Suit, i: number): PokerCard {
  return { id: `${rank}${suit}${i}`, rank, suit };
}

function poker(rank: Rank, suit: Suit, i: number, hidden = false): PokerCard {
  return { ...sampleCard(rank, suit, i), hidden };
}

function flip(id: string, kind: FlipCard["kind"], value?: number): FlipCard {
  return { id, kind, value };
}

function uno(id: string, color: UnoCard["color"], kind: UnoCard["kind"], value?: number): UnoCard {
  return { id, color, kind, value };
}

function Hand({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rule-hand" aria-label={label}>
      {children}
    </div>
  );
}

function RuleSheet({
  lead,
  rows,
  notes,
}: {
  lead: string;
  rows: Array<{ name: string; tip: string; cards: ReactNode }>;
  notes?: string[];
}) {
  return (
    <div className="rule-holdem">
      <p className="rule-lead">{lead}</p>
      <ol className="rule-rank-list">
        {rows.map((row) => (
          <li key={row.name} className="rule-rank">
            <div className="rule-rank-text">
              <b>{row.name}</b>
              <span>{row.tip}</span>
            </div>
            <Hand label={row.name}>{row.cards}</Hand>
          </li>
        ))}
      </ol>
      {notes?.length ? (
        <ul className="rule-notes">
          {notes.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function HoldemRules() {
  return (
    <RuleSheet
      lead="Heads-up Texas Hold’em. Blinds 5/10 → flop / turn / river → showdown. Best five cards from your 2 hole cards + the board wins. Two hands sit on each row, high to low."
      rows={HOLDEM_RANKS.map((row) => ({
        name: row.name,
        tip: row.tip,
        cards: row.cards.map((c, i) => <PokerFace key={`${row.name}-${i}`} card={sampleCard(c.rank, c.suit, i)} />),
      }))}
    />
  );
}

function tile(color: "black" | "white", value: number | "joker", revealed: boolean) {
  return <MahjongTile tile={{ color, value, revealed }} hide={!revealed} />;
}

function ESample({ kind }: { kind: EKind }) {
  return (
    <div className="ecard-face mini">
      <img src={cardArt(kind)} alt={cardLabel(kind)} />
    </div>
  );
}

function FruitSample({ fruit, count }: { fruit: HalliFruit; count: number }) {
  return (
    <div className={`hg-card mini fruit-${fruit}`} aria-hidden>
      <div className="hg-card-inner">
        {Array.from({ length: count }, (_, i) => (
          <span key={i} className="hg-fruit">
            {HALLI_EMOJI[fruit]}
          </span>
        ))}
      </div>
    </div>
  );
}

const PICTURED = new Set(["holdem", "coda", "flip7", "uno", "bj", "m24", "ecard", "halli"]);

export function GameRules({ game }: { game: string }) {
  if (game === "holdem") return <HoldemRules />;
  if (game === "coda") {
    return (
      <RuleSheet
        lead="2–4 players. Pick a black and white opening mix, then the tiles go down in order. Guess a hidden tile."
        rows={[
          {
            name: "Opening mix",
            tip: "You choose how many black and white tiles to start with. Four players start with 3; otherwise 4.",
            cards: (
              <>
                {tile("black", 0, false)}
                {tile("black", 0, false)}
                {tile("white", 0, false)}
                {tile("white", 0, false)}
              </>
            ),
          },
          {
            name: "In order",
            tip: "Tiles stay sorted. A face-down tile still has a place between the numbers you can see.",
            cards: (
              <>
                {tile("white", 1, true)}
                {tile("black", 4, true)}
                {tile("black", 7, true)}
                {tile("white", 9, true)}
              </>
            ),
          },
          {
            name: "Dash",
            tip: "Each color has 0–11 and one dash. The dash is shuffled in, so it may not be in the opening hand.",
            cards: (
              <>
                {tile("black", "joker", true)}
                {tile("white", "joker", true)}
              </>
            ),
          },
          {
            name: "A miss",
            tip: "Guess wrong and one of your own hidden tiles is knocked down. A hit lets you guess again or end the turn.",
            cards: (
              <>
                {tile("black", 2, true)}
                {tile("white", 6, true)}
                {tile("black", 11, true)}
              </>
            ),
          },
        ]}
        notes={[
          "The veil is opening-only. Inserts wait the full 5 seconds even after you pick a slot.",
          "Two players play rock-paper-scissors and the loser guesses first. With 3 or 4, a random player draws first.",
          "When the deck is empty, skip the draw and keep guessing.",
        ]}
      />
    );
  }
  if (game === "flip7") {
    return (
      <RuleSheet
        lead="Flip one card or stay. Seven different numbers is Flip 7. A duplicate number busts you unless Second Chance saves it."
        rows={[
          {
            name: "Your area",
            tip: "Number cards add up. Stay to bank them, or flip another.",
            cards: (
              <>
                <FlipFace card={flip("f2", "number", 2)} />
                <FlipFace card={flip("f5", "number", 5)} />
                <FlipFace card={flip("f8", "number", 8)} />
              </>
            ),
          },
          {
            name: "Bust",
            tip: "The same number twice busts the round. Second Chance discards with that duplicate, once per player.",
            cards: (
              <>
                <FlipFace card={flip("b4a", "number", 4)} />
                <FlipFace card={flip("b4b", "number", 4)} />
                <FlipFace card={flip("chance", "chance")} />
              </>
            ),
          },
          {
            name: "Flip 7",
            tip: "Seven different numbers bank immediately, plus 15.",
            cards: (
              <>
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <FlipFace key={n} card={flip(`seven-${n}`, "number", n)} />
                ))}
              </>
            ),
          },
          {
            name: "Played on a seat",
            tip: "Freeze banks that player. Flip Three makes them flip three cards now. A bonus adds to the round.",
            cards: (
              <>
                <FlipFace card={flip("plus", "plus", 2)} />
                <FlipFace card={flip("double", "double")} />
                <FlipFace card={flip("freeze", "freeze")} />
                <FlipFace card={flip("flip3", "flip3")} />
              </>
            ),
          },
        ]}
        notes={RULES.flip7}
      />
    );
  }
  if (game === "uno") {
    return (
      <RuleSheet
        lead="Match the color or the number. Empty your hand. Tap UNO before you play down to one card."
        rows={[
          {
            name: "Match",
            tip: "A red 5 can follow a red 7 or a blue 5.",
            cards: (
              <>
                <UnoFace card={uno("u1", "red", "number", 7)} />
                <UnoFace card={uno("u2", "red", "number", 5)} />
                <UnoFace card={uno("u3", "blue", "number", 5)} />
              </>
            ),
          },
          {
            name: "No match",
            tip: "Draw one card. If it fits you may play it or keep it. You do not draw again.",
            cards: (
              <>
                <UnoFace card={uno("u4", "yellow", "number", 9)} />
                <UnoFace card={uno("u5", "green", "number", 2)} />
              </>
            ),
          },
          {
            name: "Call UNO",
            tip: "With one card left, tap the UNO card beside your hand before you play.",
            cards: (
              <>
                <UnoFace card={uno("u6", "red", "number", 3)} />
                <UnoFace card={{ ...uno("back", "black", "number"), hidden: true }} />
              </>
            ),
          },
          {
            name: "Stack",
            tip: "+2 stacks on +2 or +4. +4 stacks only on +4. A wild chooses the next color.",
            cards: (
              <>
                <UnoFace card={uno("d2", "red", "draw2")} />
                <UnoFace card={uno("d2b", "blue", "draw2")} />
                <UnoFace card={uno("w4", "black", "wild4")} />
              </>
            ),
          },
        ]}
        notes={["2–4 players. The first empty hand wins."]}
      />
    );
  }
  if (game === "bj") {
    return (
      <RuleSheet
        lead="Heads-up. Closest to 21 without going over wins the hand."
        rows={[
          {
            name: "21",
            tip: "An ace with a ten or a face card is 21.",
            cards: (
              <>
                <PokerFace card={poker("A", "S", 0)} />
                <PokerFace card={poker("K", "H", 1)} />
              </>
            ),
          },
          {
            name: "Hit",
            tip: "Take another card, or stand.",
            cards: (
              <>
                <PokerFace card={poker("6", "D", 2)} />
                <PokerFace card={poker("7", "C", 3)} />
                <PokerFace card={poker("5", "S", 4)} />
              </>
            ),
          },
          {
            name: "Bust",
            tip: "Over 21 loses the hand.",
            cards: (
              <>
                <PokerFace card={poker("K", "C", 5)} />
                <PokerFace card={poker("9", "H", 6)} />
                <PokerFace card={poker("5", "D", 7)} />
              </>
            ),
          },
          {
            name: "Hole card",
            tip: "The rival’s hole card stays face down until they stand or bust.",
            cards: (
              <>
                <PokerFace card={poker("10", "S", 8)} />
                <PokerFace card={poker("A", "D", 9, true)} />
              </>
            ),
          },
        ]}
      />
    );
  }
  if (game === "m24") {
    return (
      <RuleSheet
        lead="Both players get the same four cards. Use each card once. First expression that equals 24 scores."
        rows={[
          {
            name: "Make 24",
            tip: "8 ÷ (3 − 8 ÷ 3) = 24.",
            cards: (
              <>
                <PokerFace card={poker("8", "S", 0)} />
                <PokerFace card={poker("8", "H", 1)} />
                <PokerFace card={poker("3", "C", 2)} />
                <PokerFace card={poker("3", "D", 3)} />
              </>
            ),
          },
        ]}
      />
    );
  }
  if (game === "ecard") {
    return (
      <RuleSheet
        lead="Emperor, Citizen, and Slave. Emperor beats Citizen and comes back. Slave beats Emperor and the round ends."
        rows={[
          {
            name: "The three cards",
            tip: "Emperor holds E + 4 Citizens. Slave holds S + 4 Citizens.",
            cards: (
              <>
                <ESample kind="emperor" />
                <ESample kind="citizen" />
                <ESample kind="slave" />
              </>
            ),
          },
          {
            name: "Emperor on Citizen",
            tip: "+1, and the Emperor returns to hand. The round continues.",
            cards: (
              <>
                <ESample kind="emperor" />
                <ESample kind="citizen" />
              </>
            ),
          },
          {
            name: "Slave on Emperor",
            tip: "+5 and the round ends. The Emperor was played on the Slave, so it is not returned.",
            cards: (
              <>
                <ESample kind="slave" />
                <ESample kind="emperor" />
              </>
            ),
          },
          {
            name: "Citizen on Citizen",
            tip: "+0. Both cards leave, and the round continues.",
            cards: (
              <>
                <ESample kind="citizen" />
                <ESample kind="citizen" />
              </>
            ),
          },
        ]}
        notes={[
          "12 rounds in 4 sets of 3. Roles swap every 3. Highest score after 12 wins.",
          "Citizen beats Slave +1 and that round ends.",
        ]}
      />
    );
  }
  if (game === "halli") {
    return (
      <RuleSheet
        lead="Flip one fruit card on your turn. When five of the same fruit are showing, ring first."
        rows={[
          {
            name: "Five bananas",
            tip: "2 + 2 + 1 across the table is five. Ring to take those cards.",
            cards: (
              <>
                <FruitSample fruit="banana" count={2} />
                <FruitSample fruit="banana" count={2} />
                <FruitSample fruit="banana" count={1} />
              </>
            ),
          },
          {
            name: "Other fruits",
            tip: "Cherry, strawberry, banana, and lemon each count on their own.",
            cards: (
              <>
                <FruitSample fruit="cherry" count={1} />
                <FruitSample fruit="strawberry" count={1} />
                <FruitSample fruit="lemon" count={1} />
              </>
            ),
          },
        ]}
        notes={[
          "Ring too early and you pay cards into the deck.",
          "Last player with cards, or first to the score goal, wins.",
        ]}
      />
    );
  }
  if (PICTURED.has(game)) return null;
  const items = RULES[game];
  if (!items?.length) return null;
  return (
    <ul className="rule-notes">
      {items.map((text) => (
        <li key={text}>{text}</li>
      ))}
    </ul>
  );
}

export function ClickPop({
  label,
  dot = false,
  children,
}: {
  label: string;
  dot?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="rules-pop" ref={rootRef}>
      <button
        className={dot ? "rules-dot" : "btn btn-ghost"}
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {dot ? <span /> : label}
      </button>
      {open ? (
        <div className="rules-panel" role="dialog" aria-label={label}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function RulesButton({ game, children }: { game: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button className="btn btn-ghost" type="button" onClick={() => setOpen(true)}>
        Rule
      </button>
      {open
        ? createPortal(
            <div className="rules-screen" role="dialog" aria-label="Rule">
              <div className="rules-screen-bar">
                <h2>Rule</h2>
                <button className="btn btn-ghost" type="button" onClick={() => setOpen(false)}>
                  Close
                </button>
              </div>
              <div className="rules-screen-body">
                {children}
                <GameRules game={game} />
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
