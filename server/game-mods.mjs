let cached = null;

export async function loadMods() {
  if (cached) return cached;
  const [coda, flip, bj, m24, uno, holdem, guandan] = await Promise.all([
    import("./bundled/coda.mjs"),
    import("./bundled/flip.mjs"),
    import("./bundled/bj.mjs"),
    import("./bundled/m24.mjs"),
    import("./bundled/uno.mjs"),
    import("./bundled/holdem.mjs"),
    import("./bundled/guandan.mjs"),
  ]);
  cached = { coda, flip, bj, m24, uno, holdem, guandan };
  return cached;
}
