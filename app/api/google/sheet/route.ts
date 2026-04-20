import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";

function getCreds() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");
  const creds = JSON.parse(raw);
  creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  return creds;
}

function colToLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sheetId = (url.searchParams.get("sheetId") ?? "").trim();

    if (!sheetId) {
      return NextResponse.json({ error: "Missing sheetId" }, { status: 400 });
    }

    const creds = getCreds();
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });
    const sheets = google.sheets({ version: "v4", auth });

    // Step 1: Get spreadsheet metadata — actual sheet name + column count
    const meta = await sheets.spreadsheets.get({
      spreadsheetId: sheetId,
      fields: "sheets.properties(title,gridProperties)",
    });

    const firstSheet = meta.data.sheets?.[0];
    const sheetTitle = firstSheet?.properties?.title ?? "Sheet1";
    const totalCols  = firstSheet?.properties?.gridProperties?.columnCount ?? 26;

    // Step 2: Fetch a wide enough range to cover all columns.
    // Use A1 notation with concrete cell references — always valid.
    const lastColLetter = colToLetter(Math.min(totalCols, 52));
    const dataRange = `${sheetTitle}!A1:${lastColLetter}1000`;

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: dataRange,
    });

    const rows: string[][] = resp.data.values ?? [];

    // Find last non-empty column from header row
    const headerRow = rows[0] ?? [];
    let lastUsedCol = 1;
    for (let i = headerRow.length - 1; i >= 0; i--) {
      if (headerRow[i]?.trim()) { lastUsedCol = i + 1; break; }
    }

    // Filter rows to only include up to the last used column
    const trimmed = rows.map(r => r.slice(0, lastUsedCol));

    return NextResponse.json(
      {
        success: true,
        sheetId,
        sheetTitle,
        range: dataRange,
        headers: headerRow.slice(0, lastUsedCol),
        lastCol: colToLetter(lastUsedCol),
        rowCount: trimmed.length,
        values: trimmed,
      },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { success: false, error: e?.message ?? "Failed to read sheet" },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
