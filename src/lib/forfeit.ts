/** Viewer-specific line stamped on a forfeited match. */
export function forfeitText(state: unknown): string | null {
  if (!state || typeof state !== "object") return null;
  const row = state as { forfeit?: boolean; message?: string };
  if (!row.forfeit) return null;
  const message = String(row.message || "").trim();
  return message || "Match over.";
}
