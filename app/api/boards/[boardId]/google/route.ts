import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

/**
 * Robustly extract boardId from:
 *   /api/boards/:boardId/google
 * without relying on Next's params injection (which can vary by version).
 */
function getBoardIdFromUrl(req: Request): string | null {
  const pathname = new URL(req.url).pathname; // e.g. /api/boards/<id>/google
  const parts = pathname.split("/").filter(Boolean); // ["api","boards","<id>","google"]
  const idx = parts.indexOf("boards");
  if (idx === -1) return null;
  return parts[idx + 1] ?? null;
}

export async function GET(req: Request) {
  try {
    const boardId = getBoardIdFromUrl(req);
    if (!boardId) {
      return NextResponse.json({ error: "Missing boardId" }, { status: 400 });
    }

    const { data: board, error: readErr } = await supabase
      .from("boards")
      .select("id,data")
      .eq("id", boardId)
      .single();

    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      boardId,
      google: board?.data?.google ?? null,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to read board google config" },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const boardId = getBoardIdFromUrl(req);
    if (!boardId) {
      return NextResponse.json({ error: "Missing boardId" }, { status: 400 });
    }

    const body = await req.json();
    const sheetId = (body?.sheetId ?? "").trim();
    const range = (body?.range ?? "").trim();

    if (!sheetId || !range) {
      return NextResponse.json(
        { error: "Missing sheetId or range" },
        { status: 400 }
      );
    }

    // Read current board data
    const { data: board, error: readErr } = await supabase
      .from("boards")
      .select("id,data")
      .eq("id", boardId)
      .single();

    if (readErr) {
      return NextResponse.json({ error: readErr.message }, { status: 500 });
    }

    const existingData =
      board?.data && typeof board.data === "object" ? board.data : {};

    const nextData = {
      ...existingData,
      google: { sheetId, range },
    };

    const { error: updateErr } = await supabase
      .from("boards")
      .update({ data: nextData })
      .eq("id", boardId);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      boardId,
      google: nextData.google,
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message ?? "Failed to update board google config" },
      { status: 500 }
    );
  }
}
