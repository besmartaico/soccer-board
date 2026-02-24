// lib/googleRange.ts
// Helper to normalize a Google Sheets range string.

export function normalizeGoogleRange(input: string): string {
  const s = (input || "").trim();
  if (!s) return "";
  return s.replace(/\s+/g, " ");
}
