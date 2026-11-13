// Headless snake bot audit: do CPUs actually roam / eat, or spin in place?
// Usage: node scripts/test-snake-bots.mjs   (re-bundle first: npm run bundle:games)
import * as S from "../server/bundled/snake.mjs";

let seed = Number(process.env.SEED || 1);
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
Math.random = rnd;

const SECONDS = Number(process.env.SECONDS || 120);
const GAMES = Number(process.env.GAMES || 6);
const WINDOW = 150; // ticks (~5s)

let failures = 0;
const fail = (m) => {
  failures++;
  console.log("FAIL", m);
};

function run(cpus, label) {
  S.resetSnakeAi();
  let st = S.startSnakePractice(cpus);
  let now = 1_000_000;
  const ticks = Math.round((SECONDS * 1000) / S.TICK_MS);
  const hist = new Map(); // id -> [{x,y,angle,alive,t}]
  const stats = new Map();
  for (const p of st.players) {
    hist.set(p.id, []);
    stats.set(p.id, { deaths: 0, maxScore: 0, idleWindows: 0, windows: 0, eaten: 0, wall: 0, foodSeen: 0, spinTurn: 0 });
  }
  const prevAlive = new Map(st.players.map((p) => [p.id, true]));
  const prevScore = new Map(st.players.map((p) => [p.id, 0]));
  for (let t = 0; t < ticks; t++) {
    now += S.TICK_MS;
    // "you" does a lazy wander so CPUs have a rival to avoid
    const you = st.players.find((p) => p.id === "you");
    if (you?.alive) st = S.applySnakeAction(st, "you", { type: "aim", angle: Math.sin(t / 90) * 2 });
    for (const p of st.players) {
      if (!p.human && p.alive) st = S.applySnakeAction(st, p.id, S.aiSnake(st, p.id));
    }
    st = S.stepSnake(st, now);
    for (const p of st.players) {
      const s = stats.get(p.id);
      if (prevAlive.get(p.id) && !p.alive) s.deaths++;
      prevAlive.set(p.id, p.alive);
      s.maxScore = Math.max(s.maxScore, p.score);
      const h = hist.get(p.id);
      h.push({ x: p.x, y: p.y, angle: p.angle, alive: p.alive });
      if (h.length > WINDOW) h.shift();
      if (p.human || !p.alive || h.length < WINDOW || t % 30) continue;
      if (h.some((q) => !q.alive)) continue;
      s.windows++;
      const a = h[0];
      const b = h[h.length - 1];
      const net = Math.hypot(b.x - a.x, b.y - a.y);
      let turn = 0;
      for (let i = 1; i < h.length; i++) {
        let d = h[i].angle - h[i - 1].angle;
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d < -Math.PI) d += 2 * Math.PI;
        turn += d;
      }
      // moved 150*0.58 = 87 units of path; a healthy snake covers far more than 14 units net
      if (net < 14 && Math.abs(turn) > Math.PI * 1.5) s.idleWindows++;
    }
  }
  console.log(`-- ${label}`);
  for (const [id, s] of stats) {
    if (id === "you") continue;
    const idleFrac = s.windows ? s.idleWindows / s.windows : 0;
    console.log(
      `   ${id}: deaths=${s.deaths} maxScore=${s.maxScore} windows=${s.windows} circling=${s.idleWindows} (${(idleFrac * 100).toFixed(0)}%)`,
    );
    if (idleFrac > 0.1) fail(`${label} ${id} circles in place ${(idleFrac * 100).toFixed(0)}% of the time`);
    if (s.maxScore < 3) fail(`${label} ${id} barely eats (max score ${s.maxScore})`);
    if (s.deaths > SECONDS / 12) fail(`${label} ${id} dies too often (${s.deaths})`);
  }
}

for (let g = 0; g < GAMES; g++) {
  seed = 1000 + g * 77;
  run(2, `practice 2 CPUs game ${g + 1}`);
}
for (let g = 0; g < 2; g++) {
  seed = 5000 + g * 31;
  run(6, `practice 6 CPUs game ${g + 1}`);
}
console.log(failures ? `\n${failures} failure(s)` : "\nall snake bot checks passed");
process.exit(failures ? 1 : 0);

