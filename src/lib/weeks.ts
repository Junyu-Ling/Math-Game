export type EventWeek = "steam" | "math";

export type CatalogPreview =
  | "coda"
  | "flip"
  | "uno"
  | "halli"
  | "ecard"
  | "bj"
  | "hold"
  | "gomoku"
  | "wolf"
  | "roulette"
  | "slots";

export type CatalogGame = {
  to: string;
  idx: string;
  code: string;
  name: string;
  blurb: string;
  preview: CatalogPreview;
  week: EventWeek;
};

/** Both lists stay on the home page. Drop a week here if it should close later. */
export const OPEN_WEEKS: readonly EventWeek[] = ["steam", "math"];

export const STEAM_WEEK = {
  label: "STEAM Week",
  dates: "Nov 17–21",
};

export const MATH_WEEK = {
  label: "MATH Week",
  dates: "Open now",
};

export const CATALOG: CatalogGame[] = [
  {
    to: "/play/davinci",
    idx: "01",
    code: "CODA",
    name: "Da Vinci Code",
    blurb: "Black and white acrylic tiles. Choose a color to draw, then guess the numbers in your rival’s row.",
    preview: "coda",
    week: "steam",
  },
  {
    to: "/play/uno",
    idx: "02",
    code: "UNO",
    name: "UNO",
    blurb: "Classic four-color ovals. Empty your hand to win.",
    preview: "uno",
    week: "steam",
  },
  {
    to: "/play/halli",
    idx: "03",
    code: "HALLI",
    name: "Halli Galli",
    blurb: "Flip fruit cards. When five of one fruit show, ring the bell first.",
    preview: "halli",
    week: "steam",
  },
  {
    to: "/play/ecard",
    idx: "04",
    code: "ECARD",
    name: "E-Card",
    blurb: "Kaiji’s Emperor · Citizen · Slave. Psychological duel — Slave alone can kill the Emperor.",
    preview: "ecard",
    week: "steam",
  },
  {
    to: "/play/gomoku",
    idx: "05",
    code: "GOMOKU",
    name: "Gomoku",
    blurb: "15×15. Place stones. First five in a row wins.",
    preview: "gomoku",
    week: "steam",
  },
  {
    to: "/play/werewolf",
    idx: "06",
    code: "WOLF",
    name: "Werewolf",
    blurb: "Night and day in a small village. Wolves hunt, the Seer checks, the Witch may save or poison.",
    preview: "wolf",
    week: "steam",
  },
  {
    to: "/play/flip7",
    idx: "07",
    code: "FLIP7",
    name: "Flip 7",
    blurb: "Number wreaths. Seven distinct values score a bonus. First to 200 wins.",
    preview: "flip",
    week: "math",
  },
  {
    to: "/play/blackjack",
    idx: "08",
    code: "BJ21",
    name: "Blackjack",
    blurb: "Head-to-head poker. The rival hole card stays down until they stand.",
    preview: "bj",
    week: "math",
  },
  {
    to: "/play/holdem",
    idx: "09",
    code: "HOLD",
    name: "Texas Hold’em",
    blurb: "No-limit heads-up Hold’em. Raise any amount from the min up to all in.",
    preview: "hold",
    week: "math",
  },
  {
    to: "/play/roulette",
    idx: "10",
    code: "ROULETTE",
    name: "European Roulette",
    blurb: "Single-zero wheel 0–36. One bet per spin; the house sets the payout from how many pockets you cover.",
    preview: "roulette",
    week: "math",
  },
  {
    to: "/play/slots",
    idx: "11",
    code: "SLOTS",
    name: "Slot Machine",
    blurb: "Three-reel practice slots. Pick a bet, spin, and check the paytable.",
    preview: "slots",
    week: "math",
  },
];

export function isWeekOpen(week: EventWeek) {
  return OPEN_WEEKS.includes(week);
}

export function isPathOpen(path: string) {
  const game = CATALOG.find((g) => g.to === path);
  if (!game) return true;
  return isWeekOpen(game.week);
}

export function gamesFor(week: EventWeek) {
  return CATALOG.filter((g) => g.week === week);
}
