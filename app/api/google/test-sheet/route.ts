import { NextResponse } from "next/server";
import { google } from "googleapis";

export const runtime = "nodejs";

export async function GET() {
  try {
    // 1. Read service account JSON from env
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON not found");
    }

    const creds = JSON.parse(raw);
    creds.private_key = creds.private_key.replace(/\\n/g, "\n");

    // 2. Auth
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // 3. Call YOUR sheet
    const spreadsheetId = "1K93hMUEk4do6g30-3ZgoSs5CVF5b9LvEDdJpfOVZ8s0";
    const range = "Player Detail!A:P";

    const resp = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range,
    });

    return NextResponse.json({
      success: true,
      rowCount: resp.data.values?.length ?? 0,
      sample: resp.data.values?.slice(0, 5) ?? [],
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      {
        success: false,
        error: e.message,
      },
      { status: 500 }
    );
  }
}
