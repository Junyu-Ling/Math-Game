let cached = null;

export async function loadMods() {
  if (cached) return cached;
  const [coda, flip, bj, m24, uno, holdem, halli, ecard, gomoku, ludo, animal, army, werewolf, roulette] =
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
      import("./bundled/ludo.mjs"),
      import("./bundled/animal.mjs"),
      import("./bundled/army.mjs"),
      import("./bundled/werewolf.mjs"),
      import("./bundled/roulette.mjs"),
    ]);
  cached = { coda, flip, bj, m24, uno, holdem, halli, ecard, gomoku, ludo, animal, army, werewolf, roulette };
  return cached;
}
