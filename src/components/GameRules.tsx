import { PokerFace } from "./PlayingCard";
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
    "2+ players, or Practice Solo alone. On your turn flip one card or stay to bank the round. First to 200 wins.",
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
    "Emperor: E + 4C. Slave: S + 4C. E beats C (Emperor side wins the round). C beats S (Emperor side wins the round). S beats E (Slave side wins). C vs C cancel and stay out.",
    "After a round, reclaim all cards. Slave-side round win scores 5× an Emperor-side round win. Highest score after 12 rounds wins.",
  ],
  gomoku: [
    "15×15. Open a table, add a CPU or invite, then start. Rock-paper-scissors: winner plays black. First exact five in a row wins.",
    "Black fouls: double live three (two live threes), double live four (two live fours with both ends open), or overline (six+). A blocked line is not live — sleeping threes and rush fours do not count. Exact five wins. White has no fouls.",
  ],
  ludo: [
    "2–4 players. Each color has four planes. Practice is you (blue) against a red CPU. Open a table for a full set of seats.",
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
    "Simplified party rules — no Hunter, Guard, or speech timer. Practice seats you with five CPUs.",
  ],
  roulette: [
    "Solo European roulette (single zero 0–36) against the house. Place chips, then spin.",
    "Payouts are net odds (win returns stake + profit): Straight 35:1 · Split 17:1 · Street 11:1 · Corner 8:1 · Six line 5:1 · Column/Dozen 2:1 · Even money 1:1.",
    "On 0, even-money bets (Red/Black, Odd/Even, 1–18/19–36) lose. Inside bets that include 0 can still win.",
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

function HoldemRules() {
  return (
    <div className="rule-holdem">
      <h3>RULE</h3>
      <p className="rule-lead">
        Heads-up Texas Hold’em. Blinds 5/10 → flop / turn / river → showdown. Best five cards from your 2 hole cards +
        the board wins. Rank high → low — same cards as on the table:
      </p>
      <ol className="rule-rank-list">
        {HOLDEM_RANKS.map((row) => (
          <li key={row.name} className="rule-rank">
            <div className="rule-rank-text">
              <b>{row.name}</b>
              <span>{row.tip}</span>
            </div>
            <div className="rule-hand" aria-label={row.name}>
              {row.cards.map((c, i) => (
                <PokerFace key={`${row.name}-${i}`} card={sampleCard(c.rank, c.suit, i)} />
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function GameRules({ game }: { game: string }) {
  if (game === "holdem") return <HoldemRules />;
  const items = RULES[game];
  if (!items?.length) return null;
  return (
    <div>
      <h3>RULE</h3>
      <ul>
        {items.map((text) => (
          <li key={text}>{text}</li>
        ))}
      </ul>
    </div>
  );
}
