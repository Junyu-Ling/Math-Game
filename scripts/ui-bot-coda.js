// Browser-side Da Vinci Code bot. Paste/eval it in the page of a running practice game:
//   await fetch("/scripts/ui-bot-coda.js").then((r) => r.text()).then(eval); await window.__bot(100000)
// It clicks like a human (random legal gap / draw / tile / number) and records every target that a
// real pointer could NOT hit (covered by another element, clipped, off-screen).
window.__bot = async (maxMs = 110000) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  const stats = { clicks: 0, missed: [], gapClicks: 0, tileClicks: 0, guesses: 0, draws: 0, over: false, steps: 0, minScale: 1 };
  const hittable = (el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    el.scrollIntoView({ block: "center" });
    const r2 = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r2.left + r2.width / 2, r2.top + r2.height / 2);
    return !!hit && (el === hit || el.contains(hit));
  };
  const click = (el, kind) => {
    if (!hittable(el)) {
      const rr = el.getBoundingClientRect();
      stats.missed.push(
        `${kind}:${String(el.closest(".seat")?.className || el.className).slice(0, 30)} rect=${[rr.left, rr.top, rr.width, rr.height].map(Math.round)} stack=${document
          .elementsFromPoint(rr.left + rr.width / 2, rr.top + rr.height / 2)
          .slice(0, 4)
          .map((e) => e.tagName + "." + String(e.className).slice(0, 30))
          .join(">")} vh=${innerHeight}`,
      );
    }
    el.click();
    stats.clicks++;
  };
  let lastLog = "";
  let lastChange = Date.now();
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    stats.steps++;
    if (document.querySelector(".burst-again")) {
      stats.over = true;
      break;
    }
    document.querySelectorAll(".tiles").forEach((t) => {
      const m = /scale\(([\d.]+)\)/.exec(t.style.transform || "");
      if (m) stats.minScale = Math.min(stats.minScale, +m[1]);
    });
    const logTxt = document.querySelector(".coda-panel")?.innerText || "";
    if (logTxt !== lastLog) {
      lastLog = logTxt;
      lastChange = Date.now();
    }
    if (Date.now() - lastChange > 20000) {
      stats.stuck = logTxt.slice(0, 300);
      break;
    }
    const rps = [...document.querySelectorAll(".rps-pick:not(:disabled)")];
    if (rps.length) {
      click(rnd(rps), "rps");
      await sleep(300);
      continue;
    }
    const gaps = [...document.querySelectorAll(".gap.on")];
    if (gaps.length) {
      click(rnd(gaps), "gap");
      stats.gapClicks++;
      await sleep(250);
      continue;
    }
    const draws = [...document.querySelectorAll(".draw-color-btn:not(:disabled)")];
    if (draws.length) {
      click(rnd(draws), "draw");
      stats.draws++;
      await sleep(300);
      continue;
    }
    const cont = [...document.querySelectorAll(".btn-go:not(:disabled), .btn-gold:not(:disabled)")];
    if (cont.length) {
      click(rnd(cont), "cont");
      await sleep(300);
      continue;
    }
    const pad = [...document.querySelectorAll(".pad button:not(:disabled):not(.tried)")];
    if (pad.length) {
      click(rnd(pad), "guess");
      stats.guesses++;
      await sleep(300);
      continue;
    }
    if (/Knock down/.test(document.body.innerText)) {
      const pen = [...document.querySelectorAll(".seat-you .mj.selected")];
      if (pen.length) {
        click(rnd(pen), "penalty");
        await sleep(300);
        continue;
      }
    }
    const status = document.querySelector(".status-line")?.innerText || "";
    if (/tap a hidden tile first/i.test(document.querySelector(".coda-play-actions")?.innerText || "") && !/^Wait/i.test(status)) {
      const tiles = [...document.querySelectorAll(".seat:not(.seat-you) .mj.face-down")].filter(
        (t) => t.tagName === "BUTTON" && !t.classList.contains("selected"),
      );
      if (tiles.length) {
        click(rnd(tiles), "tile");
        stats.tileClicks++;
        await sleep(300);
        continue;
      }
    }
    await sleep(150);
  }
  stats.ms = Date.now() - t0;
  stats.status = document.querySelector(".status-line")?.innerText;
  return stats;
};
"ok";
