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
    "2+ players. On your turn flip one card or stay to bank the round. First to 200 wins.",
    "Duplicate number busts you unless you hold Second Chance (passive — discards with the duplicate; one per player).",
    "Seven different numbers in your area is Flip 7: bank immediately with an extra +15.",
    "Freeze and Flip Three can target any active player, including yourself. Last active player must use them on themselves.",
    "Freeze banks that player’s round score. Flip Three forces three flips on the target.",
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
  holdem: [
    "Heads-up Texas Hold’em. Blinds 5/10, then flop / turn / river, then showdown. Best five cards from your 2 hole cards + the board wins the pot.",
    "Rank high → low (examples). Royal flush: A♠ K♠ Q♠ J♠ 10♠. Straight flush: 9♥ 8♥ 7♥ 6♥ 5♥. Four of a kind: K♣ K♦ K♥ K♠ 2♦ (four Kings).",
    "Full house: A♠ A♥ A♦ 8♣ 8♠ (three Aces + pair of 8s) beats three of a kind: 7♠ 7♥ 7♦ K♣ 2♠. Flush: A♦ J♦ 9♦ 6♦ 3♦ (same suit, not in sequence).",
    "Straight: 10♣ 9♦ 8♠ 7♥ 6♣ (any suits, in sequence). A-2-3-4-5 is the lowest straight; 10-J-Q-K-A is the highest. Two pair: A♠ A♦ 5♣ 5♥ K♠ beats one pair: Q♥ Q♣ A♠ 9♦ 4♣.",
    "High card: if nobody has a pair or better, highest card wins — e.g. A♠ J♦ 8♣ 6♥ 2♠ beats K♥ Q♦ 9♣ 7♠ 3♥. Same hand type: compare the key cards (then kickers) until one side is higher.",
  ],
  ecard: [
    "Heads-up. Open a table, add a CPU or invite one friend, then start. RPS winner picks the opening side. 12 rounds in 4 sets of 3; roles swap every 3.",
    "Emperor: E + 4C. Slave: S + 4C. E beats C (Emperor side wins the round). C beats S (Emperor side wins the round). S beats E (Slave side wins). C vs C cancel and stay out.",
    "After a round, reclaim all cards. Slave-side round win scores 5× an Emperor-side round win. Highest score after 12 rounds wins.",
  ],
  gomoku: [
    "15×15. Open a table, add a CPU or invite, then start. Rock-paper-scissors: winner plays black. First exact five in a row wins.",
    "Black fouls lose immediately: double open three, double open four, or overline (six or more). White has no forbidden moves.",
  ],
  ludo: [
    "Two-player flying chess. Each has four pieces. Roll a die to move.",
    "Need a 6 to leave base. Exact count to enter home. First to park all four wins. Rolling 6 grants another roll.",
  ],
  animal: [
    "Dou Shou Qi on a 7×9 board with rivers, traps, and dens.",
    "Higher rank captures lower. Rat beats Elephant; Elephant cannot eat Rat. Lions/Tigers jump rivers. Enter the rival den to win.",
  ],
  army: [
    "Simplified open 军棋. Higher rank wins clashes; equal ranks both fall.",
    "Bomb trades with anything. Only Engineer clears mines. Capture the rival 军旗 to win.",
  ],
};

export function GameRules({ game }: { game: string }) {
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
