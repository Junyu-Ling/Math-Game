import { hardSoft, type BjDuelState } from "../games/blackjack/engine";
import { dropRow, winLineAt, type C4State, type Stone } from "../games/c4/engine";
import {
  aiDrawColor,
  aiGuess,
  aiShouldContinue,
  deckCounts,
  insertIndices,
  type CodaState,
} from "../games/davinci/engine";
import { aiEcard, type EState } from "../games/ecard/engine";
import { aiDecide, aiTarget, areaScore, currentFlip, type FlipState } from "../games/flip7/engine";
import { aiGomoku, applyGomokuAction, type GState } from "../games/gomoku/engine";
import { bestHand, raiseBounds, type HoldemState } from "../games/holdem/engine";
import type { RouletteState } from "../games/roulette/engine";
import { pocketColor } from "../games/roulette/engine";
import { labelUno, legalCards, type UnoState } from "../games/uno/engine";
import type { SlotsState } from "../games/slots/engine";
import { SYMBOL_LABEL } from "../games/slots/engine";
import type { SnakeState } from "../games/snake/engine";
import type { TttState, Mark } from "../games/ttt/engine";
import type { Lesson } from "./RuleSession";

const LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

function wait(title: string, body: string, veteran: string): Lesson {
  return { title, body, veteran, aim: null };
}

function tttWin(board: Mark[], mark: Mark): number | null {
  for (const line of LINES) {
    const marks = line.map((i) => board[i]);
    if (marks.filter((v) => v === mark).length === 2 && marks.includes(0)) {
      return line[marks.indexOf(0)]!;
    }
  }
  return null;
}

export function lessonTtt(state: TttState | null): Lesson {
  if (!state || state.phase !== "play" && state.phase !== "over") {
    return wait("Three in a row", "X goes first. Three of the same mark in a row, column, or diagonal wins. This hand is being dealt.", "The center touches four lines. A corner touches three. An edge touches two.");
  }
  if (state.phase === "over") {
    const name = state.players.find((p) => p.id === state.winnerId)?.name;
    return wait(
      name ? `${name} made three` : "The board filled",
      name
        ? "A finished line ends the hand at once. New hand deals an empty board, and X still goes first."
        : "Every cell is full and nobody has three. That is a draw. Neither mark scores.",
      "If you can make two threats at once, the other side can block only one. That is a fork.",
    );
  }
  const me = state.players[state.turn];
  if (!me?.human) {
    return wait(
      "Watch this reply",
      `${me?.name ?? "CPU"} places next. They take a winning cell if one exists, and they block your winning cell if you have one. Otherwise they prefer the center, then a corner.`,
      "Count the empty cells on each line that already has two of one mark. That line is the whole position.",
    );
  }
  const mark = me.mark ?? 1;
  const foe = (mark === 1 ? 2 : 1) as Mark;
  const win = tttWin(state.board, mark);
  const block = tttWin(state.board, foe);
  const empty = state.board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  const i = win ?? block ?? (state.board[4] ? null : 4) ?? empty.find((n) => [0, 2, 6, 8].includes(n)) ?? empty[0] ?? 0;
  const why =
    win != null
      ? "Two of your marks already sit on this line. The empty cell finishes it. Take it now — a win ends the hand."
      : block != null
        ? "The other mark already has two on this line. If you play anywhere else, they finish it on the next turn. Block this cell."
        : i === 4
          ? "The center is empty. It belongs to four different lines, so it is the strongest opening on an empty board."
          : "No line is one mark from done. A corner joins three lines; an edge joins only two. The arrow marks a corner.";
  return {
    title: win != null ? "Finish the line" : block != null ? "Block this cell" : "Take the stronger cell",
    body: `${why} You are ${mark === 1 ? "X" : "O"}. Only empty cells accept a mark.`,
    veteran: "After the center is taken, a corner opposite their mark keeps two lines alive. An edge does not.",
    aim: `cell-${i}`,
  };
}

export function lessonC4(state: C4State | null): Lesson {
  if (!state || (state.phase !== "play" && state.phase !== "over")) {
    return wait("Four in a row", "Discs fall to the lowest empty cell in the column. Four in a row, column, or diagonal wins.", "A disc you play can also complete a line for the other color on the cell above it. Look one row up before you drop.");
  }
  if (state.phase === "over") {
    const name = state.players.find((p) => p.id === state.winnerId)?.name;
    return wait(
      name ? `${name} connects four` : "The grid is full",
      name ? "That line is four connected discs. The hand ends immediately." : "Every cell is full and nobody has four. Draw.",
      "The threat that matters is often the cell above your disc, not the disc itself.",
    );
  }
  const me = state.players[state.turn];
  if (!me?.human || !me.stone) {
    return wait("Watch the drop", "The CPU uses the same gravity. It takes a winning column, then a blocking column, and it avoids handing you the cell directly above.", "If both colors can win on the next turn, the player to move wins, because they play first.");
  }
  const stone = me.stone;
  const foe = (stone === 1 ? 2 : 1) as Stone;
  const open = [3, 2, 4, 1, 5, 0, 6].filter((col) => dropRow(state.board, col) >= 0);
  const finishes = (who: Stone) => {
    for (const col of open) {
      const row = dropRow(state.board, col);
      const board = state.board.map((shaft) => shaft.slice()) as Stone[][];
      board[col]![row] = who;
      if (winLineAt(board, col, row)) return col;
    }
    return null;
  };
  const win = finishes(stone);
  const block = finishes(foe);
  let col = win ?? block ?? open[0] ?? 3;
  let why =
    win != null
      ? `Column ${col + 1} drops onto a line that already has three of yours. That is four. Take it.`
      : block != null
        ? `Column ${col + 1} is where they would finish four on their next turn. Drop there first.`
        : `No four is ready. Column ${col + 1} is the middle of the grid, so the disc touches more future lines.`;
  if (win == null && block == null) {
    for (const candidate of open) {
      const row = dropRow(state.board, candidate);
      const above = row + 1;
      if (above >= 6) continue;
      const board = state.board.map((shaft) => shaft.slice()) as Stone[][];
      board[candidate]![row] = stone;
      board[candidate]![above] = foe;
      if (winLineAt(board, candidate, above)) continue;
      col = candidate;
      why = `Column ${col + 1} does not give them an instant four on the cell above your disc. The center columns build more lines than the edges.`;
      break;
    }
  }
  const row = dropRow(state.board, col);
  return {
    title: win != null ? "This column wins" : block != null ? "Stop their four" : "Drop in this column",
    body: why,
    veteran: "Two threats on the same turn cannot both be blocked. Build the second one before you cash the first.",
    aim: row >= 0 ? `c4-${col}-${row}` : null,
  };
}

export function lessonGomoku(state: GState | null): Lesson {
  if (!state || state.phase === "lobby") {
    return wait("Five in a row", "Black and white take turns. Exactly five connected stones wins. Six or more in a row is not a win for Black.", "Black also loses for two live threes or two live fours. A line that is already blocked at one end is not live.");
  }
  if (state.phase === "rps") {
    return {
      title: "Throw for the first stone",
      body: "Rock-paper-scissors decides who places first. Any of the three throws is legal. The arrow marks Rock so you can see the control. After the throws show, the winner's color goes down.",
      veteran: "First move is an advantage on an empty board, but the color still matters: only Black can foul.",
      aim: "rps-rock",
    };
  }
  if (state.phase === "over") {
    return wait(
      state.winnerId ? "Five stones, or a foul" : "No five on the board",
      state.foul
        ? `Black's last stone was a foul (${state.foul.kind}). Forbidden shapes lose at once, even without five for White.`
        : "Exactly five in a row wins. An overline does not count as Black's win.",
      "A live four must be answered. Two live threes are a foul only for Black.",
    );
  }
  const me = state.players[state.turn];
  if (!me?.human) {
    return wait("Watch the stone", "The CPU plays the strongest empty point it can see: a finishing five, then a block, then a stone that extends a line.", "If they ignore a live four, the game is already over on your next turn.");
  }
  const action = aiGomoku(state);
  if (action.type !== "place") {
    return wait("Place one stone", "Tap an empty intersection. Exactly five wins.", "Black cannot play two live threes, two live fours, or a line of six.");
  }
  const next = applyGomokuAction(state, me.id, action);
  const win = next.winnerId === me.id && !next.foul;
  return {
    title: win ? "This stone makes five" : "Play this intersection",
    body: win
      ? "The stones already on this line, plus this empty point, are five. Place it. The hand ends."
      : `This is the strongest empty point on the board right now. It extends a line you have, or it takes the point they would use next. You are ${me.stone === 1 ? "black" : "white"}.`,
    veteran: me.stone === 1
      ? "Before you play, check that the stone does not leave two open threes or two open fours. That foul loses even if the shape looks attacking."
      : "White has no fouls. You can make six, two live threes, or two live fours. Black cannot.",
    aim: `g-${action.r}-${action.c}`,
  };
}

export function lessonUno(state: UnoState | null): Lesson {
  if (!state || (state.phase !== "play" && state.phase !== "color" && state.phase !== "over")) {
    return wait("Match the discard", "Play a card that matches the color or the number on the pile. A wild can be played on anything, and you then name the color.", "Save a wild for a turn when nothing else matches. A +4 is strongest when the next player is about to go out.");
  }
  if (state.phase === "over") {
    const name = state.players.find((p) => p.id === state.winnerId)?.name ?? "Someone";
    return wait("The hand is empty", `${name} played their last card. First empty hand wins. Skip, reverse, and draw cards never score here — they only change the turn.`, "Call UNO when you play down to one card. Forgetting it is how a one-card lead gets punished.");
  }
  const me = state.players[state.turn];
  if (!me) return wait("UNO", "Match color or number.", "Wilds choose the next color.");
  if (!me.human && state.phase !== "color") {
    return wait("Watch the pile", `${me.name} must match the discard or draw. A skip or reverse moves the turn. +2 and +4 stack onto the next player when they cannot answer with the same kind.`, "If a +2 is on the pile, answer with another +2 or take the cards. A wild +4 works the same way.");
  }
  if (state.phase === "color") {
    const counts = (["red", "yellow", "green", "blue"] as const).map((c) => ({
      c,
      n: me.hand.filter((card) => card.color === c).length,
    }));
    counts.sort((a, b) => b.n - a.n);
    const color = counts[0]?.c ?? "red";
    return {
      title: `Name ${color}`,
      body: `A wild has no color of its own until you choose one. You hold ${counts[0]?.n ?? 0} ${color} card${counts[0]?.n === 1 ? "" : "s"}, more than the other colors, so the next turns are easier if the pile stays ${color}.`,
      veteran: "Name the color you can follow, not the color you wish they could not play. Their hand is hidden; yours is not.",
      aim: `color-${color}`,
    };
  }
  const top = state.discard.at(-1);
  const legal = legalCards(state, me.id);
  if (state.justDrawnId) {
    const drawn = me.hand.find((c) => c.id === state.justDrawnId);
    const playable = Boolean(drawn && legal.some((c) => c.id === drawn.id));
    return playable && drawn
      ? {
          title: "You may play the card you just drew",
          body: `${labelUno(drawn)} matches the pile. Play it now, or keep it and pass. You do not draw again on the same turn.`,
          veteran: "Keeping a drawn wild is right when the pile color already suits the rest of your hand.",
          aim: `card-${drawn.id}`,
        }
      : {
          title: "Keep it and pass",
          body: "The card you drew does not match the pile. You cannot play it. Keep ends the turn.",
          veteran: "One draw per turn when you had no legal card. You are not allowed to dig until you find a match.",
          aim: "keep",
        };
  }
  if (me.hand.length === 2 && legal.length) {
    return {
      title: "Play, and be ready to call UNO",
      body: `You have two cards. ${labelUno(legal[0]!)} can go on ${top ? labelUno(top) : "the pile"}. Playing it leaves one card, so call UNO on that same turn.`,
      veteran: "The UNO button is the call. Playing the card without the call is how you get caught with one card.",
      aim: `card-${legal[0]!.id}`,
    };
  }
  if (!legal.length) {
    return {
      title: "Nothing matches — draw",
      body: `The pile is ${top ? labelUno(top) : "waiting"}. None of your cards share its color or its number, and you have no wild. Draw one. If that card matches, you may play it. If it does not, keep it.`,
      veteran: state.pendingDraw > 0
        ? `A draw stack is waiting (${state.pendingDraw}). You can answer with the same draw card, or take the whole stack.`
        : "Do not spend a wild just to avoid one draw, unless the next player has one card.",
      aim: "draw",
    };
  }
  const card = legal[0]!;
  return {
    title: `Play ${labelUno(card)}`,
    body: `${labelUno(card)} is legal on ${top ? labelUno(top) : "the pile"} because it shares the color, the number, or it is a wild. Skip jumps a player. Reverse flips the direction. +2 makes the next player draw or stack another +2.`,
    veteran: "Prefer a number card when a skip would only send the turn to someone with many cards. Prefer the skip when the next player has one card.",
    aim: `card-${card.id}`,
  };
}

export function lessonBj(state: BjDuelState | null): Lesson {
  if (!state || (state.phase !== "play" && state.phase !== "over")) {
    return wait("Closest to 21", "Face cards are 10. An ace is 1 or 11. You hit to take a card or stand to stop. Going over 21 busts.", "A soft hand still has an ace counted as 11. Soft 16 can take a card without busting, because the ace can fall back to 1.");
  }
  const you = state.players.find((p) => p.id === "you");
  const cpu = state.players.find((p) => p.id !== "you");
  if (state.phase === "over" || !you) {
    return wait("The totals are compared", state.message || "Closer to 21 without busting wins. A bust loses to any standing total.", "The CPU stands on 17 or more, including a soft 17. Your decision is only about your own total.");
  }
  const mine = hardSoft(you.cards);
  const actor = state.players[state.turn];
  if (!actor || actor.id !== "you") {
    const theirs = cpu ? hardSoft(cpu.cards).total : 0;
    return wait(
      "The CPU is playing their hand",
      `Your total is ${mine.total}${mine.soft ? " soft" : ""}. They hit below 17 and stand on 17 or higher. Their current total is ${theirs}. You will see every card they take.`,
      "Because both hands are fully visible in this duel, you already know if you are ahead. In a casino shoe the dealer's hole card stays down.",
    );
  }
  const hit = mine.total < 17;
  return {
    title: hit ? `Hit on ${mine.total}` : `Stand on ${mine.total}`,
    body: hit
      ? `${mine.total}${mine.soft ? " is soft, so an ace is still 11. " : " "}Under 17, another card is the right draw: most hands below 17 lose to a made 17 or more. If the next card puts you over 21, that is a bust and the CPU wins.`
      : `${mine.total} is already a made hand. Another card busts a hard total this high more often than it helps. Stand and let the CPU play. They will hit until they reach 17.`,
    veteran: mine.soft
      ? "Soft means you cannot bust with one card: the ace switches from 11 to 1. That is why a soft 16 still hits."
      : "The CPU's cards are face up here, so if they already have a higher standing total you still should not hit a hard 17. Busting gives the hand away for certain.",
    aim: hit ? "hit" : "stand",
  };
}

const HAND = ["high card", "a pair", "two pair", "three of a kind", "a straight", "a flush", "a full house", "four of a kind", "a straight flush", "a royal flush"];

function rankValue(rank: string | undefined) {
  return ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].indexOf(rank ?? "");
}

export function lessonHoldem(state: HoldemState | null): Lesson {
  if (!state || state.street === "lobby") {
    return wait("No-limit heads-up", "Two hole cards. Five community cards come flop, turn, river. Best five-card hand takes the pot.", "You can raise any amount from the minimum up to all in. The minimum raise is the size of the last full raise.");
  }
  const you = state.players.find((p) => p.id === "you");
  if (!you) return wait("Hold'em", "Two hole cards against the CPU.", "Position acts last after the flop.");
  if (state.street === "showdown" || state.street === "over" || you.folded) {
    return {
      title: state.street === "showdown" ? "Show the hands" : "The pot is decided",
      body: state.message || "Best five cards from the two hole cards plus the board wins. A fold gives the pot to the other player.",
      veteran: "A kicker plays when the pairs are the same. Ace-king beats ace-queen when both make a pair of aces.",
      aim: state.street === "showdown" ? "next" : null,
    };
  }
  const mine = state.turn === state.players.findIndex((p) => p.id === "you");
  const bounds = raiseBounds(state, "you");
  const hole = `${you.hole[0]?.rank ?? "?"}${you.hole[1]?.rank ?? "?"}`;
  if (!mine) {
    return wait(
      "Wait for the CPU",
      `You hold ${hole}. The pot is ${state.pot}. They must call, check, raise, or fold before the next card. Your hole cards stay hidden.`,
      "If they bet small into a large pot, you are being offered a cheap card. If they shove, you need a hand that can win at showdown.",
    );
  }
  const cat = state.community.length >= 3 ? Math.floor(bestHand(you.hole, state.community) / 15 ** 5) : 0;
  const made = HAND[cat] ?? "high card";
  const pair = you.hole[0] && you.hole[1] && you.hole[0].rank === you.hole[1].rank;
  const high = Math.max(rankValue(you.hole[0]?.rank), rankValue(you.hole[1]?.rank));
  let aim = "check";
  let title = "Check";
  let body = "";
  if (state.community.length < 3) {
    if (pair || high >= 11) {
      aim = bounds.canFullRaise ? "raise" : "call";
      title = pair ? "Raise the pair" : "Raise the high cards";
      body = pair
        ? `You hold a pair of ${you.hole[0]!.rank}s before the flop. That is ahead of almost every unpaired hand. Raise to charge them for seeing the flop.`
        : `You hold ${hole}. High cards win more flops than low cards, and they make the best kickers. Raise, or call if a raise is not open.`;
    } else if (high >= 8) {
      aim = bounds.toCall > 0 ? "call" : "check";
      title = bounds.toCall > 0 ? `Call ${bounds.toCall}` : "Check";
      body = `You hold ${hole}. It is worth seeing a flop for a small price. Calling ${bounds.toCall || "nothing"} keeps the hand alive without building a pot your hand cannot win yet.`;
    } else {
      aim = bounds.toCall > 0 ? "fold" : "check";
      title = bounds.toCall > 0 ? "Fold the low cards" : "Check";
      body = `You hold ${hole}. Unpaired low cards miss most flops. ${bounds.toCall > 0 ? "Folding gives up this pot and keeps the rest of the stack." : "There is nothing to call, so check."}`;
    }
  } else if (cat >= 2 || (cat >= 1 && bounds.toCall === 0)) {
    aim = bounds.canFullRaise ? "raise" : bounds.toCall > 0 ? "call" : "check";
    title = cat >= 2 ? `Bet ${made}` : `You have ${made}`;
    body = `The board gives you ${made}. Betting asks them to pay with a worse hand. If a raise is closed, ${bounds.toCall > 0 ? "call" : "check"}.`;
  } else if (bounds.toCall === 0) {
    aim = "check";
    title = "Check the weak hand";
    body = `You have ${made} and nobody has bet. Checking is free. You still see the next card.`;
  } else if (cat >= 1 && bounds.toCall <= state.pot) {
    aim = "call";
    title = `Call ${bounds.toCall} with ${made}`;
    body = `You have ${made}. The call is ${bounds.toCall} into a pot of ${state.pot}, so you are not paying more than the pot to continue.`;
  } else {
    aim = "fold";
    title = "Fold";
    body = `You have ${made}, and it costs ${bounds.toCall} to continue a pot of ${state.pot}. That price is too high for this hand. Folding keeps the chips you have left.`;
  }
  return {
    title,
    body,
    veteran: `Pot odds: you risk ${bounds.toCall} to win ${state.pot}. Call when your hand wins often enough to cover that price. A min raise here is ${bounds.min}.`,
    aim,
  };
}

export function lessonFlip(state: FlipState | null): Lesson {
  if (!state || state.phase === "lobby") {
    return wait("Hit or stay", "Flip number cards into your row. Seven different numbers score a bonus. A duplicate number busts the row.", "Freeze locks a player. Flip Three forces three more cards. Second Chance survives one bust.");
  }
  if (state.phase === "over") {
    const name = state.players.find((p) => p.id === state.winnerId)?.name;
    return wait(name ? `${name} reached the goal` : "Round over", "Scores add up across rounds. The target is 200 in a normal table. A bust scores nothing for that row.", "Staying on six different numbers is often better than fishing for the seventh.");
  }
  const me = state.players.find((p) => p.human) ?? currentFlip(state);
  const cur = currentFlip(state);
  const scored = areaScore(me.area);
  if (state.phase === "target") {
    const id = aiTarget(state);
    const who = state.players.find((p) => p.id === id);
    const self = id === cur.id;
    return {
      title: self ? "Use it on yourself" : `Use it on ${who?.name ?? "them"}`,
      body: state.pendingAction === "freeze"
        ? self
          ? "Freeze banks the row you have. Use it on yourself when your score is already high or you are one number from Flip 7."
          : "Freeze forces that player to stay. Point it at the highest live score, especially a row that still has Second Chance."
        : self
          ? "Flip Three deals three more cards to the chosen row. Your row is still thin, so the extra cards help you more than they threaten a bust."
          : "Their row is full of numbers. Three forced cards are likely to duplicate one and bust them.",
      veteran: "A modifier does nothing until you choose a target. The same card is good or bad depending on whose row it hits.",
      aim: `target-${id}`,
    };
  }
  if (cur.id !== me.id) {
    return wait(
      "Their turn to flip",
      `${cur.name} hits or stays. A duplicate number busts. Seven different numbers is Flip 7 and scores the bonus immediately.`,
      `Your row is ${scored.numbers} different number${scored.numbers === 1 ? "" : "s"} for ${scored.score} points.`,
    );
  }
  const choice = aiDecide(state);
  const stay = choice === "stay";
  return {
    title: stay ? "Stay" : "Hit",
    body: stay
      ? `You have ${scored.numbers} different numbers and ${scored.score} points. Another card is more likely to duplicate one you already hold than to help. Staying banks this row.`
      : scored.numbers === 0
        ? "The row is empty. The first card cannot bust. Hit."
        : `You have ${scored.numbers} different numbers, score ${scored.score}. There is still room before a duplicate becomes likely. Hit. Flip 7 is seven different numbers, and it pays a bonus on top of the sum.`,
    veteran: "Second Chance in the row absorbs the next bust. Without it, one repeated number wipes the row for the round.",
    aim: stay ? "stay" : "hit",
  };
}

export function lessonEcard(state: EState | null): Lesson {
  if (!state || state.phase === "lobby") {
    return wait("Emperor, citizen, slave", "Emperor beats citizen. Citizen beats slave. Slave beats emperor, and that one win pays more.", "The emperor side wins the small fights. The slave side exists to catch the emperor.");
  }
  const you = state.players.find((p) => p.id === "you") ?? state.players.find((p) => p.human);
  if (state.phase === "over") {
    return wait("The match is scored", state.log.at(-1)?.text || "Points decide it. Slave-side wins pay more than emperor-side wins.", "A round can end the set when the slave falls, because that card does not return.");
  }
  if (state.phase === "rps") {
    return {
      title: "Throw for the right to choose",
      body: "The winner of rock-paper-scissors chooses a side: Emperor, with four citizens, or Slave, with four citizens. Any throw is legal. The arrow marks Rock.",
      veteran: "Choosing Slave is a bet that you will find their emperor. Choosing Emperor is a bet that you will win the citizen fights.",
      aim: "rps-rock",
    };
  }
  if (state.phase === "role") {
    const mine = state.roleChooserId === you?.id;
    return mine
      ? {
          title: "Take the Slave side",
          body: "You won the throw, so you pick. Slave is the only card that beats the emperor, and that win pays 5. Emperor beats each citizen for 1, and the emperor card comes back. The arrow marks Slave.",
          veteran: "If you are already ahead, Emperor grinds the remaining citizens. If you are behind, only the Slave payout catches up in one round.",
          aim: "role-slave",
        }
      : wait("They are choosing a side", "The winner of the throw picks Emperor or Slave. You take the other side. Then each of you plays one hidden card a round.", "You will see your own five cards. Theirs stay hidden until both have locked.");
  }
  if (state.phase === "reveal") {
    const last = state.last;
    const yours = last ? (last.aId === you?.id ? last.a : last.b) : null;
    const theirs = last ? (last.aId === you?.id ? last.b : last.a) : null;
    return {
      title: "Read the two cards",
      body: yours && theirs
        ? `You played ${yours}. They played ${theirs}. Emperor beats citizen for 1 point and the emperor returns. Citizen beats slave for 1 and the round ends. Slave beats emperor for 5.`
        : "Both cards flip together. Emperor beats citizen. Citizen beats slave. Slave beats emperor.",
      veteran: "After a slave-versus-emperor win, the payout is the whole point of that side. The smaller citizen wins will not catch it quickly.",
      aim: "next",
    };
  }
  if (!you) return wait("E-Card", "Pick one card and lock it.", "Slave beats emperor.");
  const suggestion = aiEcard(state, you.id);
  if (state.phase === "pick" && you.selectedId) {
    return {
      title: "Lock the card",
      body: "Lock freezes your choice. You cannot swap it after that. Both cards flip when the other side locks too.",
      veteran: "Locking a citizen while you still hold the slave is how you keep the emperor-killer for a later round.",
      aim: "lock",
    };
  }
  if (suggestion.type === "select" && suggestion.cardId) {
    const card = you.hand.find((c) => c.id === suggestion.cardId);
    const kind = card?.kind ?? "citizen";
    return {
      title: kind === "citizen" ? "Play a citizen" : `Play the ${kind}`,
      body:
        kind === "citizen"
          ? "A citizen beats a slave and loses to the emperor. Playing one keeps your special card in hand. The arrow marks a citizen."
          : kind === "slave"
            ? "The slave is the only card that beats the emperor. Play it when you want the large payout. It loses to a citizen."
            : "The emperor beats every citizen and returns to your hand. It loses only to the slave.",
      veteran: "Count the citizens left. The emperor side wants to peel them off for 1 point each. The slave side wants one round against the emperor.",
      aim: `card-${suggestion.cardId}`,
    };
  }
  return {
    title: "Pick one card",
    body: "Choose one card from your hand, then lock it. The other side does the same. The cards flip together.",
    veteran: "Do not spend the slave on a round where a citizen still does the job.",
    aim: you.hand[0] ? `card-${you.hand[0].id}` : null,
  };
}

export function lessonCoda(state: CodaState | null, youId: string | null): Lesson {
  const you = state?.players.find((p) => p.id === youId) ?? state?.players.find((p) => p.human);
  if (!state || !you || state.phase === "lobby") {
    return wait(
      "A new row is being dealt",
      "Black and white are separate, 0 through 11 plus one dash each. Numbers stay sorted. You guess a hidden tile on someone else's row.",
      "A dash stays in the gap where it was placed. Later numbers slide around it.",
    );
  }
  if (state.phase === "over") {
    const name = state.players.find((p) => p.id === state.winnerId)?.name ?? "The table";
    return wait("Every hidden tile was named", `${name} finishes when the other rows are face up. A wrong guess turns one of your own tiles face up instead.`, "Guess the narrowest gap first. A tile between two shown numbers has fewer legal calls than a tile at the end of the row.");
  }
  if (state.phase === "rps") {
    return {
      title: "The loser guesses first",
      body: "Two players throw rock, paper, or scissors. The loser is the first to draw and guess. Any throw is legal. The arrow marks Rock.",
      veteran: "Going second is better only if you want to see a tile revealed before you commit. The throw itself is even.",
      aim: "rps-rock",
    };
  }
  const actor = state.players[state.turn];
  if (state.phase === "arrange") {
    const card = state.pending;
    const mine = actor?.id === you.id;
    if (!mine || !card) {
      return wait(
        "They are placing a tile",
        "Numbers slide into sorted order. A dash can sit in any gap, and it stays there. You have a few seconds when it is your tile.",
        "The widest gap hides a dash for longer, because more numbers could still belong on either side of it.",
      );
    }
    const gaps = insertIndices(you.tiles, card);
    const gap = gaps[Math.floor(gaps.length / 2)] ?? gaps[0] ?? 0;
    const dash = card.value === "joker";
    return {
      title: dash ? "Place the dash" : "Slide the number in",
      body: dash
        ? "A dash is not a number, so it does not sort itself. Tap a gap. It stays between those neighbors even when later numbers arrive. You have 5 seconds."
        : "This number has to stay in order with the tiles you can already see. The lit gaps are the only legal ones. The arrow marks one of them.",
      veteran: "Put a dash in a wide gap when you can. A dash on the end is the first thing other players test.",
      aim: `gap-${gap}`,
    };
  }
  if (actor && actor.id !== you.id && state.phase !== "penalty") {
    return wait(
      `${actor.name} is playing`,
      "They draw one color, then name a hidden tile. A hit lets them guess again. A miss knocks one of their tiles face up.",
      "Use what they just revealed. A new face-up number shrinks the gaps on both sides of it.",
    );
  }
  if (state.phase === "draw") {
    const counts = deckCounts(state);
    const color = counts.black === 0 ? "white" : counts.white === 0 ? "black" : aiDrawColor(state);
    return {
      title: `Draw ${color}`,
      body: `You must draw before you guess. Black has ${counts.black} left and white has ${counts.white} left. You cannot pick a color that is gone. The new tile joins your row in order, still hidden from them, unless it is a dash you have to place.`,
      veteran: "Draw the color they have more hidden tiles in when you are hunting. Draw the color you are missing when your own row has a wide gap.",
      aim: `draw-${color}`,
    };
  }
  if (state.phase === "guess") {
    const pick = aiGuess(state);
    if (!state.selected && pick) {
      const row = state.players.find((p) => p.id === pick.playerId);
      return {
        title: "Guess this hidden tile",
        body: `${row?.name ?? "Their"} tile under the arrow is still face down. The row is sorted, so the shown tiles on either side limit what this one can be. Tap it, then call one number.`,
        veteran: "Prefer a tile squeezed between two shown numbers. End tiles can be almost anything still left in that color.",
        aim: `tile-${pick.playerId}-${pick.index}`,
      };
    }
    if (pick) {
      const call = pick.value === "joker" ? "the dash" : String(pick.value);
      return {
        title: `Call ${call}`,
        body: pick.value === "joker"
          ? "A dash is a legal call. Use it when the gap is wide and the numbers around it are already spoken for."
          : `${call} still fits this gap, and it has not been tried on this tile. One call. A hit leaves the tile face up and you may guess again. A miss flips one of yours.`,
        veteran: "If several numbers fit, the middle of the remaining range is the one the position allows most often. A miss is more expensive than passing once you are unsure.",
        aim: pick.value === "joker" ? "guess-joker" : `guess-${pick.value}`,
      };
    }
  }
  if (state.phase === "continue") {
    const again = aiShouldContinue(state);
    return {
      title: again ? "Guess again" : "End the turn",
      body: again
        ? "The last call was right, so the turn is still yours. Another hidden tile is narrow enough to try. Hit again, or end the turn if you would rather not risk a miss."
        : "You may guess again, but the remaining tiles are wide. A miss turns one of your hidden tiles face up for the whole table. End the turn.",
      veteran: "A miss gives them a shown number in your row, which makes their next guess easier. Cash a sure tile. Leave a guess that still has four or more numbers.",
      aim: again ? "continue" : "stay",
    };
  }
  if (state.phase === "penalty") {
    const index = you.tiles.findIndex((t) => !t.revealed);
    return {
      title: "Choose the tile they will see",
      body: "The call was wrong. One of your hidden tiles is knocked face up. You choose which one. The arrow marks a tile that is still hidden.",
      veteran: "Give up a tile in a wide gap, or one at the end. Giving up a tile that sits between two shown numbers tells them the most.",
      aim: index >= 0 ? `penalty-${index}` : null,
    };
  }
  return wait("Follow the row", "Numbers stay in order. Guess a hidden tile by naming its number or the dash.", "Shown tiles are information for both sides.");
}

export function lessonSnake(state: SnakeState | null): Lesson {
  const me = state?.players.find((p) => p.id === "you");
  if (!state || !me) {
    return {
      title: "Steer into a practice arena",
      body: "This is a fresh arena with CPU snakes. Move with the mouse or WASD. Eat pellets to grow and fill energy. Hold Space, or the boost button, to spend energy and go faster. Hitting a body or a wall drops you.",
      veteran: "Boost only in a clear line. Speed makes a wall arrive sooner, and a boost into a body is still a crash.",
      aim: "steer",
    };
  }
  let best: { x: number; y: number; d: number } | null = null;
  for (const food of state.foods) {
    const d = (food.x - me.x) ** 2 + (food.y - me.y) ** 2;
    if (!best || d < best.d) best = { x: food.x, y: food.y, d };
  }
  const dx = (best?.x ?? me.x) - me.x;
  const dy = (best?.y ?? me.y) - me.y;
  const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  const far = (best?.d ?? 0) > 80 * 80;
  const boost = me.energy > 40 && far && me.alive;
  return {
    title: boost ? "Boost toward the pellet" : `Steer ${dir}`,
    body: me.alive
      ? `The nearest pellet is ${dir} of your head. Point the mouse that way, or hold that direction. Eating grows you and refills energy. ${boost ? "The path is long and your energy is up, so hold boost to get there first." : "Save the boost until the line in front of you is empty."}`
      : "You crashed. A short shield brings you back. Steer away from the body you hit.",
    veteran: "Your own tail is solid. A tight U-turn into yourself counts as a crash. Cut only when the space is wider than your body.",
    aim: boost ? "boost" : "steer",
  };
}

const ROULETTE_LESSONS: Lesson[] = [
  {
    title: "Bet red",
    body: "Red covers 18 pockets. The house pays 1 to 1, because 36 divided by 18 is 2, and the stake itself is already returned in that 2. One bet per spin.",
    veteran: "Even-money bets (red, black, odd, even, 1–18, 19–36) all pay 1 to 1. Zero is green and loses them.",
    aim: "out-red",
  },
  {
    title: "Bet a single number",
    body: "A straight number covers 1 pocket out of 37. The house pays 35 to 1. The arrow marks 17. Any other number is the same price.",
    veteran: "The formula is floor(36 ÷ pockets) − 1. One pocket pays 35. Twelve pockets pay 2. Eighteen pockets pay 1.",
    aim: "n-17",
  },
  {
    title: "Bet the middle dozen",
    body: "2nd 12 covers 13 through 24, twelve pockets. That pays 2 to 1. Dozen bets lose when zero or another dozen hits.",
    veteran: "A column is also twelve pockets and also pays 2 to 1. The difference is which numbers are in the set, not the price.",
    aim: "dozen-2",
  },
  {
    title: "Bet zero",
    body: "Zero is the green pocket. It is a one-number bet, so it pays 35 to 1, the same as any other single number. It is also the pocket that beats every even-money bet.",
    veteran: "European has one zero, not two. That is the house edge on the even-money bets.",
    aim: "n-0",
  },
];

export function lessonRoulette(state: RouletteState | null, seed: number): Lesson {
  if (!state) return ROULETTE_LESSONS[0]!;
  if (state.phase === "result") {
    const color = pocketColor(state.result ?? 0);
    const won = state.lastWin > 0;
    return {
      title: won ? `${state.result} paid` : `${state.result} missed`,
      body: `The ball landed on ${state.result} (${color}). ${won ? `That pocket was inside your bet, so the table paid ${state.lastWin}.` : "That pocket was outside your bet, so the stake stays with the house."} Next round clears the felt for one new bet.`,
      veteran: "The payout was fixed when you placed the bet, from how many pockets it covered. The spin does not change the price.",
      aim: "next",
    };
  }
  if (state.phase === "spinning") {
    return wait("The wheel is turning", "One bet is locked. The pocket it covers is already priced. Wait for the ball.", "You cannot add a second bet on this spin.");
  }
  const bet = state.bets[0];
  if (bet) {
    return {
      title: "Spin this bet",
      body: `You have ${bet.stake} on ${bet.kind}. It covers ${bet.kind === "straight" ? "1 pocket" : "the pockets in that box"} and pays ${Math.max(0, Math.floor(36 / Math.max(1, bet.numbers?.length || 1)) - 1)} to 1. One bet per spin. The arrow marks Spin.`,
      veteran: "Undo removes the last chip. Clear takes the whole bet back before you spin.",
      aim: "spin",
    };
  }
  return ROULETTE_LESSONS[Math.abs(seed) % ROULETTE_LESSONS.length]!;
}

export function lessonSlots(state: SlotsState | null): Lesson {
  if (!state) {
    return {
      title: "Spin the three reels",
      body: "One line, left to right. Three of a kind pays the multiple on the paytable. A wild fills in for a missing symbol. Two cherries on the left still pay 2×.",
      veteran: "The stake is taken when the reels start. A win pays stake times the multiple, and that includes giving the stake back.",
      aim: "spin",
    };
  }
  if (state.phase === "spinning") {
    return wait("The reels are stopping", "Each reel lands on its own. The line is read only when all three have stopped.", "A wild on the line can complete three of a kind with the other two symbols.");
  }
  const [a, b, c] = state.reels;
  const names = `${SYMBOL_LABEL[a]}, ${SYMBOL_LABEL[b]}, ${SYMBOL_LABEL[c]}`;
  if (state.phase === "result") {
    return {
      title: state.lastWin > 0 ? `This line paid ${state.lastWin}` : "This line missed",
      body: state.lastWin > 0
        ? `The reels stopped on ${names}. That shape is on the paytable, so the bet of ${state.bet} paid ${state.lastWin}. Spin again for a new line.`
        : `The reels stopped on ${names}. They are not three of a kind, and they are not two cherries on the left, so the bet of ${state.bet} is lost. The next spin is a new draw.`,
      veteran: "Cherry pays on two only when they are the left reels. Three cherries pays the three-of-a-kind line instead.",
      aim: "spin",
    };
  }
  const affordable = state.chips >= state.bet;
  return {
    title: affordable ? "Spin this stake" : "Lower the bet",
    body: affordable
      ? `The stake is ${state.bet}, and you have ${state.chips}. Three matching symbols pay that stake times the paytable multiple. Wild substitutes. Two left-side cherries pay 2× even without a third.`
      : `The stake ${state.bet} is bigger than your ${state.chips} chips. Pick a smaller bet, then spin.`,
    veteran: "Changing the bet does not change which symbols are likely. It only changes how many chips the next line is worth.",
    aim: affordable ? "spin" : "bet-1",
  };
}
