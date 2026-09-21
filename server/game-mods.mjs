export async function loadMods() {
  const [coda, flip, bj, m24, uno, holdem, guandan] = await Promise.all([
    import("./bundled/coda.mjs"),
    import("./bundled/flip.mjs"),
    import("./bundled/bj.mjs"),
    import("./bundled/m24.mjs"),
    import("./bundled/uno.mjs"),
    import("./bundled/holdem.mjs"),
    import("./bundled/guandan.mjs"),
  ]);
  return { coda, flip, bj, m24, uno, holdem, guandan };
}
