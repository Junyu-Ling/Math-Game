import { useSyncExternalStore } from "react";

let meta: Record<string, unknown> = {};
const listeners = new Set<() => void>();

export function setPlayMeta(next: Record<string, unknown>) {
  meta = next;
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function usePlayMeta() {
  return useSyncExternalStore(subscribe, () => meta, () => meta);
}
