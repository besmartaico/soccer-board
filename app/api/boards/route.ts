import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: NextRequest) {
  try {
    const { teamId, name } = await req.json();
    if (!teamId || !name) {
      return NextResponse.json(
        { error: "teamId and name required" },
        { status: 400 }
      );
    }

    // Authenticate user from Bearer token
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = userData.user.id;

    // Copy google config from an existing board on this team so the new board
    // automatically loads players from the same sheet
    let googleConfig: { sheetId: string; range: string } | null = null;
    const { data: existingBoards } = await supabaseAdmin
      .from("boards")
      .select("data")
      .eq("team_id", teamId)
      .limit(5);
    if (existingBoards) {
      for (const b of existingBoards) {
        const gc = (b.data as { google?: { sheetId?: string; range?: string } } | null)?.google;
        if (gc?.sheetId && gc?.range) {
          googleConfig = { sheetId: gc.sheetId, range: gc.range };
          break;
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from("boards")
      .insert({
        team_id: teamId,
        name,
        created_by: userId,
        data: {
          htmlBoard: { placedPlayers: [], objects: [] },
          ...(googleConfig ? { google: googleConfig } : {}),
        },
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ board: data }, { status: 201 });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
