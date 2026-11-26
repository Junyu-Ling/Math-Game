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

function splitNals(bytes: Uint8Array) {
  const nals: Uint8Array[] = [];
  const leadAt = (pos: number) => {
    if (pos + 3 < bytes.length && bytes[pos] === 0 && bytes[pos + 1] === 0 && bytes[pos + 2] === 1) return 3;
    if (pos + 4 < bytes.length && bytes[pos] === 0 && bytes[pos + 1] === 0 && bytes[pos + 2] === 0 && bytes[pos + 3] === 1) return 4;
    return 0;
  };
  let i = 0;
  while (i < bytes.length && !leadAt(i)) i += 1;
  while (i < bytes.length) {
    const lead = leadAt(i);
    if (!lead) break;
    const start = i + lead;
    let end = start;
    while (end < bytes.length && !leadAt(end)) end += 1;
    if (end > start) nals.push(bytes.subarray(start, end));
    i = end;
  }
  return nals;
}

function isAnnexB(bytes: Uint8Array) {
  return bytes.length > 4 && bytes[0] === 0 && bytes[1] === 0 && (bytes[2] === 1 || (bytes[2] === 0 && bytes[3] === 1));
}

function nalsToAvcc(nals: Uint8Array[]) {
  let size = 0;
  for (const nal of nals) size += 4 + nal.length;
  const out = new Uint8Array(size);
  let offset = 0;
  for (const nal of nals) {
    out[offset] = (nal.length >>> 24) & 255;
    out[offset + 1] = (nal.length >>> 16) & 255;
    out[offset + 2] = (nal.length >>> 8) & 255;
    out[offset + 3] = nal.length & 255;
    out.set(nal, offset + 4);
    offset += 4 + nal.length;
  }
  return out;
}

function avcDecoderConfig(sps: Uint8Array, pps: Uint8Array) {
  const desc = new Uint8Array(11 + sps.length + pps.length);
  desc[0] = 1;
  desc[1] = sps[1] || 0x42;
  desc[2] = sps[2] || 0;
  desc[3] = sps[3] || 0x1f;
  desc[4] = 0xff;
  desc[5] = 0xe1;
  desc[6] = (sps.length >> 8) & 255;
  desc[7] = sps.length & 255;
  desc.set(sps, 8);
  let offset = 8 + sps.length;
  desc[offset] = 1;
  desc[offset + 1] = (pps.length >> 8) & 255;
  desc[offset + 2] = pps.length & 255;
  desc.set(pps, offset + 3);
  return desc;
}

const VIDEO_COLOR = { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false } as const;

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
    const ctx = canvas.getContext("2d", { alpha: false, colorSpace: "srgb" });
    if (!ctx) throw new Error("Could not prepare the video");

    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: "avc", width: WIDTH, height: HEIGHT, frameRate: FPS },
      fastStart: "in-memory",
      firstTimestampBehavior: "offset",
    });
    let failed: Error | null = null;
    let sps: Uint8Array | null = null;
    let pps: Uint8Array | null = null;
    let configured = false;
    const waiting: { data: Uint8Array; type: "key" | "delta"; timestamp: number; duration: number }[] = [];
    const duration = Math.round(1_000_000 / FPS);
    const writeSample = (sample: { data: Uint8Array; type: "key" | "delta"; timestamp: number; duration: number }, withConfig: boolean) => {
      muxer.addVideoChunkRaw(
        sample.data,
        sample.type,
        sample.timestamp,
        sample.duration,
        withConfig && sps && pps
          ? { decoderConfig: { codec: "avc1.42001f", description: avcDecoderConfig(sps, pps), colorSpace: VIDEO_COLOR } }
          : undefined,
      );
    };
    encoder = new VideoEncoder({
      output: (chunk, meta) => {
        const raw = new Uint8Array(chunk.byteLength);
        chunk.copyTo(raw);
        const sampleDuration = chunk.duration && chunk.duration > 0 ? chunk.duration : duration;
        if (isAnnexB(raw)) {
          const nals = splitNals(raw);
          for (const nal of nals) {
            const kind = (nal[0] ?? 0) & 31;
            if (kind === 7) sps = nal;
            if (kind === 8) pps = nal;
          }
          const data = nalsToAvcc(nals.filter((nal) => ((nal[0] ?? 0) & 31) !== 9));
          waiting.push({ data, type: chunk.type, timestamp: chunk.timestamp, duration: sampleDuration });
          if (sps && pps) {
            for (const sample of waiting) writeSample(sample, !configured && sample === waiting[0]);
            configured = true;
            waiting.length = 0;
          }
          return;
        }
        const browser = meta?.decoderConfig;
        if (browser?.description) {
          muxer.addVideoChunk(chunk, {
            decoderConfig: {
              codec: browser.codec || "avc1.42001f",
              description: browser.description,
              colorSpace: browser.colorSpace ?? VIDEO_COLOR,
            },
          });
          configured = true;
          return;
        }
        waiting.push({ data: raw, type: chunk.type, timestamp: chunk.timestamp, duration: sampleDuration });
      },
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
    });
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
        const timestamp = Math.round((written * 1_000_000) / FPS);
        const bitmap = await createImageBitmap(canvas);
        const frame = new VideoFrame(bitmap, { timestamp, duration, alpha: "discard" });
        bitmap.close();
        encoder.encode(frame, { keyFrame: written % 24 === 0 });
        frame.close();
        written += 1;
        if (failed) throw failed;
      }
      opts.onProgress?.(n + 1, indexes.length);
    }
    await encoder.flush();
    if (failed) throw failed;
    if (waiting.length && sps && pps) {
      for (const sample of waiting) writeSample(sample, !configured && sample === waiting[0]);
      configured = true;
      waiting.length = 0;
    }
    if (!configured) throw new Error("Could not prepare the video");
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
