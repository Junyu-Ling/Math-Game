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
    "+2 and +4 can stack. Wilds pick the next color.",
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
    "Heads-up Texas Hold’em. Blinds, then flop / turn / river, then showdown.",
    "Best five-card hand using hole cards and the board wins the pot.",
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
