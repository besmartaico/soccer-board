import { NextResponse } from "next/server";
import { google } from "googleapis";

function getCreds() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

  const creds = JSON.parse(raw);
  creds.private_key = creds.private_key.replace(/\\n/g, "\n");
  return creds;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sheetId = (url.searchParams.get("sheetId") ?? "").trim();
    const range = (url.searchParams.get("range") ?? "").trim();

    if (!sheetId) {
      return NextResponse.json({ error: "Missing sheetId" }, { status: 400 });
    }
    if (!range) {
      return NextResponse.json({ error: "Missing range" }, { status: 400 });
    }

    const creds = getCreds();

    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range,
    });

    return NextResponse.json(
      {
        success: true,
        sheetId,
        range,
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
