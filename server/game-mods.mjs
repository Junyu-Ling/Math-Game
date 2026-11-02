let cached = null;

export async function loadMods() {
  if (cached) return cached;
  const [coda, flip, bj, m24, uno, holdem, halli, ecard, gomoku, ttt, c4, snake, ludo, animal, army, werewolf] =
    await Promise.all([
      import("./bundled/coda.mjs"),
      import("./bundled/flip.mjs"),
      import("./bundled/bj.mjs"),
      import("./bundled/m24.mjs"),
      import("./bundled/uno.mjs"),
      import("./bundled/holdem.mjs"),
      import("./bundled/halli.mjs"),
      import("./bundled/ecard.mjs"),
      import("./bundled/gomoku.mjs"),
      import("./bundled/ttt.mjs"),
      import("./bundled/c4.mjs"),
      import("./bundled/snake.mjs"),
      import("./bundled/ludo.mjs"),
      import("./bundled/animal.mjs"),
      import("./bundled/army.mjs"),
      import("./bundled/werewolf.mjs"),
    ]);
  cached = { coda, flip, bj, m24, uno, holdem, halli, ecard, gomoku, ttt, c4, snake, ludo, animal, army, werewolf };
  return cached;
}
