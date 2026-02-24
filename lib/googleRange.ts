// lib/googleRange.ts
// Lightweight helper to keep a Google Sheets A1 range stable/clean.
// We intentionally keep this conservative (no heavy parsing) so it can't
// break valid A1 notation.

export function normalizeGoogleRange(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";

  // Collapse internal whitespace (e.g., "Roster!A1 : K200" -> "Roster!A1 : K200")
  // We do NOT remove spaces around ':' or '!' to avoid surprising behavior.
  return s.replace(/\s+/g, " ");
}
