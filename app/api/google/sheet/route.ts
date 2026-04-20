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

// Convert a 1-based column index to a letter(s): 1=A, 26=Z, 27=AA, etc.
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
    const rangeParam = (url.searchParams.get("range") ?? "").trim();

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

    // Determine sheet name from range param or default to first sheet
    let sheetName = "Sheet1";
    if (rangeParam && rangeParam.includes("!")) {
      sheetName = rangeParam.split("!")[0];
    } else if (rangeParam && !rangeParam.includes(":")) {
      // treat bare word as sheet name
      sheetName = rangeParam;
    }

    // Step 1: Fetch row 1 only to discover actual column count
    const row1Resp = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `${sheetName}!1:1`,
    });

    const headerRow: string[] = row1Resp.data.values?.[0] ?? [];
    // Find last non-empty header
    let lastCol = 1;
    for (let i = headerRow.length - 1; i >= 0; i--) {
      if (headerRow[i]?.trim()) { lastCol = i + 1; break; }
    }
    // Ensure at least column A, cap at 52 columns
    lastCol = Math.min(Math.max(lastCol, 1), 52);
    const lastColLetter = colToLetter(lastCol);

    // Step 2: Fetch full data up to discovered last column
    const dataRange = `${sheetName}!A:${lastColLetter}`;
    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: dataRange,
    });

    return NextResponse.json(
      {
        success: true,
        sheetId,
        range: dataRange,
        headers: headerRow,
        lastCol: lastColLetter,
        rowCount: resp.data.values?.length ?? 0,
        values: resp.data.values ?? [],
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
