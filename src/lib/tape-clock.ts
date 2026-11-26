/** Playback clock shared by the watch bar and the MP4. Every moment is kept, in order. */
export function tapePoints(times: number[]) {
  const points = [0];
  for (let i = 1; i < times.length; i++) {
    const raw = (times[i] ?? 0) - (times[i - 1] ?? 0);
    const gap = raw > 40 ? Math.min(800, Math.max(240, raw)) : 240;
    points.push((points[points.length - 1] ?? 0) + gap);
  }
  return points;
}

export function indexAtTime(points: number[], ms: number) {
  let index = 0;
  while (index + 1 < points.length && (points[index + 1] ?? 0) <= ms) index += 1;
  return index;
}
