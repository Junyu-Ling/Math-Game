import { shuffle, uid } from "./shuffle";

export type Suit = "S" | "H" | "D" | "C" | "J";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "BJ" | "RJ";

export type PokerCard = {
  id: string;
  suit: Suit;
  rank: Rank;
  hidden?: boolean;
};

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Array<Exclude<Suit, "J">> = ["S", "H", "D", "C"];

export function suitGlyph(suit: Suit): string {
  return { S: "♠", H: "♥", D: "♦", C: "♣", J: "★" }[suit];
}

export function isRed(suit: Suit, rank?: Rank): boolean {
  if (suit === "J") return rank === "RJ";
  return suit === "H" || suit === "D";
}

export function rankValue(rank: Rank): number {
  if (rank === "A") return 1;
  if (rank === "J") return 11;
  if (rank === "Q") return 12;
  if (rank === "K") return 13;
  if (rank === "BJ") return 14;
  if (rank === "RJ") return 15;
  return Number(rank);
}

export function holdemRank(rank: Rank): number {
  if (rank === "A") return 14;
  if (rank === "K") return 13;
  if (rank === "Q") return 12;
  if (rank === "J") return 11;
  if (rank === "BJ" || rank === "RJ") return 0;
  return Number(rank);
}

export function makeDeck(): PokerCard[] {
  const cards: PokerCard[] = [];
  for (const suit of SUITS) for (const rank of RANKS) cards.push({ id: uid("pk"), suit, rank });
  return shuffle(cards);
}

export function makeShoe(n = 1): PokerCard[] {
  return shuffle(Array.from({ length: n }, () => makeDeck()).flat());
}

