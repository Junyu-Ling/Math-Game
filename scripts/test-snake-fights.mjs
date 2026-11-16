// CPU-vs-CPU behaviour audit on a consistent fake clock (so spawn shields really expire):
// bots must still develop (grow, eat) but also hunt / cut off / flee and kill each other.
//   npm run bundle:games   (or the snake esbuild line) first, then:  node scripts/test-snake-fights.mjs
import * as S from "../server/bundled/snake.mjs";

let seed = Number(process.env.SEED || 7);
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
Math.random = rnd;

const SECONDS = Number(process.env.SECONDS || 240);
const GAMES = Number(process.env.GAMES || 5);
const CPUS = Number(process.env.CPUS || 6);

let failures = 0;
const fail = (m) => {
  failures++;
  console.log("FAIL", m);
};

const realNow = Date.now.bind(Date);
let clock = 5_000_000;
Date.now = () => clock;

const tot = { kills: 0, wall: 0, huntTicks: 0, fleeTicks: 0, boostTicks: 0, ticks: 0, maxScore: 0, bigGrowth: 0, bots: 0 };

function run(label) {
  S.resetSnakeAi();
  clock += 100_000;
  let st = S.startSnakePractice(CPUS);
  // Practice starts with a human "you"; make it a plain CPU so we only watch bot-vs-bot.
  st = { ...st, players: st.players.map((p) => ({ ...p, human: false })) };
  const ticks = Math.round((SECONDS * 1000) / S.TICK_MS);
  const prevAlive = new Map(st.players.map((p) => [p.id, true]));
  const best = new Map(st.players.map((p) => [p.id, 0]));
  let kills = 0;
  let wall = 0;
  let hunt = 0;
  let flee = 0;
  let boost = 0;
  for (let t = 0; t < ticks; t++) {
    clock += S.TICK_MS;
    for (const p of st.players) if (p.alive) st = S.applySnakeAction(st, p.id, S.aiSnake(st, p.id));
    for (const p of st.players) {
      if (!p.alive) continue;
      const m = S.snakeAiMode(p.id);
      if (m?.mode === "hunt") hunt++;
      if (m?.mode === "flee") flee++;
      if (p.boosting) boost++;
    }
    st = S.stepSnake(st, clock);
    for (const p of st.players) {
      if (prevAlive.get(p.id) && !p.alive) {
        const edge = Math.min(p.x, p.y, S.WORLD - p.x, S.WORLD - p.y);
        if (edge < S.HEAD_R + 1.2) wall++;
        else kills++;
      }
      prevAlive.set(p.id, p.alive);
      best.set(p.id, Math.max(best.get(p.id) || 0, p.score));
    }
  }
  const top = Math.max(...best.values());
  const avgBest = [...best.values()].reduce((a, b) => a + b, 0) / best.size;
  console.log(
    `-- ${label}: body-kills=${kills} wall-deaths=${wall} hunt=${hunt} flee=${flee} boost=${boost} bestScore=${top} avgBest=${avgBest.toFixed(1)}`,
  );
  tot.kills += kills;
  tot.wall += wall;
  tot.huntTicks += hunt;
  tot.fleeTicks += flee;
  tot.boostTicks += boost;
  tot.ticks += ticks * st.players.length;
  tot.maxScore = Math.max(tot.maxScore, top);
  tot.bots += st.players.length;
  tot.bigGrowth += avgBest;
}

for (let g = 0; g < GAMES; g++) {
  seed = 900 + g * 131;
  run(`${CPUS} CPUs game ${g + 1}`);
}
Date.now = realNow;

const avgBest = tot.bigGrowth / GAMES;
console.log(
  `\ntotal: body-kills=${tot.kills} wall-deaths=${tot.wall} hunt-share=${((tot.huntTicks / tot.ticks) * 100).toFixed(1)}% flee-share=${((tot.fleeTicks / tot.ticks) * 100).toFixed(1)}% boost-share=${((tot.boostTicks / tot.ticks) * 100).toFixed(1)}% avgBest=${avgBest.toFixed(1)}`,
);

if (tot.kills < GAMES) fail(`bots barely kill each other (${tot.kills} kills in ${GAMES} games)`);
if (tot.huntTicks / tot.ticks < 0.03) fail("bots almost never hunt");
if (tot.huntTicks / tot.ticks > 0.6) fail("bots hunt nearly all the time — they should develop in between");
if (tot.fleeTicks === 0) fail("no bot ever fled a bigger snake");
if (avgBest < 12) fail(`bots stop developing (average best score ${avgBest.toFixed(1)})`);
if (tot.wall > tot.kills * 1.5 + 2 * GAMES) fail(`too many wall deaths (${tot.wall}) vs kills (${tot.kills})`);
console.log(failures ? `\n${failures} failure(s)` : "\nsnake fight checks passed");
process.exit(failures ? 1 : 0);
