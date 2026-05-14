// Roster import parser: CSV, Excel, and Google Sheets all normalize to { headers, rows }
import Papa from "papaparse";
import * as XLSX from "xlsx";

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

export async function parseCsvFile(file: File): Promise<ParsedSheet> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = (result.data as Record<string, string>[]) || [];
        const headers = result.meta.fields ?? (rows[0] ? Object.keys(rows[0]) : []);
        resolve({ headers, rows });
      },
      error: (err) => reject(err),
    });
  });
}

export async function parseExcelFile(file: File): Promise<ParsedSheet> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[firstSheet];
  const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: "",
    raw: false,
  });
  const headers = json.length ? Object.keys(json[0]) : [];
  const rows = json.map((r) => {
    const out: Record<string, string> = {};
    for (const h of headers) out[h] = String(r[h] ?? "");
    return out;
  });
  return { headers, rows };
}

// Calls existing /api/google/sheet GET endpoint. Sheet must be public-shared.
export async function parseGoogleSheet(sheetId: string): Promise<ParsedSheet> {
  const res = await fetch("/api/google/sheet?sheetId=" + encodeURIComponent(sheetId));
  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "Failed to load Google Sheet");
  }
  const data = await res.json();
  // The existing endpoint returns { values: string[][] } — first row is headers
  const values: string[][] = data?.values ?? [];
  if (!values.length) return { headers: [], rows: [] };
  const headers = values[0].map((h) => String(h).trim());
  const rows = values.slice(1).map((arr) => {
    const out: Record<string, string> = {};
    headers.forEach((h, i) => { out[h] = String(arr[i] ?? "").trim(); });
    return out;
  });
  return { headers, rows };
}

export interface FieldMapping {
  external_id: string;
  name: string;
  picture_url: string;
  jersey_number: string;
  // Optional columns the user wants to keep as JSON extras
  extras: string[];
}

export interface MappedPlayer {
  external_id: string;
  name: string;
  picture_url: string;
  jersey_number: number;
  extra: Record<string, string>;
}

export interface MappingResult {
  players: MappedPlayer[];
  errors: { row: number; message: string }[];
}

export function applyMapping(rows: Record<string, string>[], mapping: FieldMapping): MappingResult {
  const players: MappedPlayer[] = [];
  const errors: { row: number; message: string }[] = [];

  rows.forEach((r, i) => {
    const id = (r[mapping.external_id] ?? "").trim();
    const name = (r[mapping.name] ?? "").trim();
    const pic = (r[mapping.picture_url] ?? "").trim();
    const jerseyRaw = (r[mapping.jersey_number] ?? "").trim();
    const jersey = parseInt(jerseyRaw, 10);

    if (!id || !name || !pic || isNaN(jersey)) {
      errors.push({
        row: i + 2,
        message: `Missing required field (id=${id || "?"}, name=${name || "?"}, pic=${pic ? "ok" : "?"}, #=${jerseyRaw || "?"})`,
      });
      return;
    }

    const extra: Record<string, string> = {};
    for (const col of mapping.extras) {
      if (r[col] != null && r[col] !== "") extra[col] = String(r[col]);
    }

    players.push({
      external_id: id,
      name,
      picture_url: pic,
      jersey_number: jersey,
      extra,
    });
  });

  return { players, errors };
}

// Auto-suggest field mapping based on common header names
export function autoMap(headers: string[]): Partial<FieldMapping> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const find = (candidates: string[]) => {
    const cands = candidates.map(norm);
    return headers.find((h) => cands.some((c) => norm(h) === c || norm(h).includes(c)));
  };
  return {
    external_id: find(["id", "playerid", "studentid", "uniqueid"]) ?? "",
    name: find(["playername", "name", "fullname", "player"]) ?? "",
    picture_url: find(["picture", "photo", "image", "pictureurl", "photourl", "imageurl", "avatar"]) ?? "",
    jersey_number: find(["jersey", "jerseynumber", "number", "shirtnumber", "no", "num"]) ?? "",
  };
}
