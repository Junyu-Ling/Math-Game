export async function loadMods() {
  const [coda, flip, bj, m24] = await Promise.all([
    import("./bundled/coda.mjs"),
    import("./bundled/flip.mjs"),
    import("./bundled/bj.mjs"),
    import("./bundled/m24.mjs"),
  ]);
  return { coda, flip, bj, m24 };
}
