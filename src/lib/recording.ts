import { toCanvas } from "html-to-image";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import type { TapeFrame } from "./lobby";

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 8;

let queuedId = "";
let running = false;

export function queueRecording(matchId: string) {
  queuedId = matchId;
}

export function cancelQueuedRecording() {
  queuedId = "";
}

export function consumeQueuedRecording(roomId: string) {
  if (!queuedId || running) return false;
  const bare = roomId.replace(/^replay:/, "");
  if (queuedId !== bare && queuedId !== roomId) return false;
  queuedId = "";
  return true;
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function paint() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve(undefined)));
}

function pickIndexes(total: number, max = 90) {
  if (total <= 1) return [0];
  if (total <= max) return Array.from({ length: total }, (_, i) => i);
  const seen = new Set<number>();
  for (let i = 0; i < max; i++) seen.add(Math.round((i * (total - 1)) / (max - 1)));
  return [...seen];
}

function fileName(game: string, matchId: string) {
  const safeGame = (game || "game").replace(/[^\w.-]+/g, "") || "game";
  const safeId = matchId.replace(/^replay:/, "").replace(/[^\w.-]+/g, "").slice(0, 24) || "match";
  return `bitefun-${safeGame}-${safeId}.mp4`;
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

async function gameNode() {
  for (let i = 0; i < 30; i++) {
    const node = document.querySelector<HTMLElement>(".page-wide");
    if (node && node.getBoundingClientRect().height > 40) return node;
    await delay(50);
  }
  throw new Error("Open the match before saving a video");
}

function fitFrame(ctx: CanvasRenderingContext2D, shot: HTMLCanvasElement) {
  ctx.fillStyle = "#f4f2ee";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  if (!shot.width || !shot.height) return;
  const scale = Math.min(WIDTH / shot.width, HEIGHT / shot.height);
  const dw = Math.round(shot.width * scale);
  const dh = Math.round(shot.height * scale);
  ctx.drawImage(shot, Math.round((WIDTH - dw) / 2), Math.round((HEIGHT - dh) / 2), dw, dh);
}

/** Play the open table from the tape and save an MP4 of what is on screen. */
export async function recordVisibleMatch(opts: {
  game: string;
  matchId: string;
  total: number;
  seek: (index: number) => void;
  onProgress?: (done: number, total: number) => void;
}) {
  if (running) throw new Error("A video is already saving");
  if (typeof VideoEncoder === "undefined") throw new Error("This browser cannot save MP4");
  running = true;
  let encoder: VideoEncoder | null = null;
  try {
    const node = await gameNode();
    const indexes = pickIndexes(Math.max(1, opts.total));
    const repeats = 2;
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not prepare the video");

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: "avc", width: WIDTH, height: HEIGHT, frameRate: FPS },
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    });
    let failed: Error | null = null;
    encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (err) => {
        failed = err instanceof Error ? err : new Error("Could not encode the video");
      },
    });
    const support = await VideoEncoder.isConfigSupported({
      codec: "avc1.42001f",
      width: WIDTH,
      height: HEIGHT,
      bitrate: 1_800_000,
      framerate: FPS,
    });
    if (!support.supported) throw new Error("This browser cannot save MP4");
    encoder.configure({
      codec: "avc1.42001f",
      width: WIDTH,
      height: HEIGHT,
      bitrate: 1_800_000,
      framerate: FPS,
      latencyMode: "quality",
      avc: { format: "avc" },
    } as VideoEncoderConfig);
    let written = 0;
    for (let n = 0; n < indexes.length; n++) {
      opts.seek(indexes[n] ?? 0);
      await paint();
      await paint();
      await delay(30);
      let shot: HTMLCanvasElement | null = null;
      try {
        shot = await toCanvas(node, {
          pixelRatio: 1,
          backgroundColor: "#f4f2ee",
          skipFonts: true,
          cacheBust: true,
          filter: (dom) => !(dom instanceof HTMLElement && (dom.classList.contains("watch-bar") || dom.classList.contains("rule-dock"))),
        });
      } catch {
        shot = null;
      }
      if (shot) fitFrame(ctx, shot);
      for (let copy = 0; copy < repeats; copy++) {
        const frame = new VideoFrame(canvas, { timestamp: Math.round((written * 1_000_000) / FPS) });
        encoder.encode(frame, { keyFrame: written % 24 === 0 });
        frame.close();
        written += 1;
        if (failed) throw failed;
      }
      opts.onProgress?.(n + 1, indexes.length);
    }
    await encoder.flush();
    if (failed) throw failed;
    muxer.finalize();
    if (!written) throw new Error("Nothing to save");
    downloadBlob(new Blob([target.buffer], { type: "video/mp4" }), fileName(opts.game, opts.matchId));
  } finally {
    try {
      encoder?.close();
    } catch {
      /* already closed */
    }
    running = false;
  }
}

export type { TapeFrame };
