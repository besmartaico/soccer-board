import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL;

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");
  if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * GET /api/boards/[boardId]
 *
 * Returns board if:
 *   1. User is a member of the board's team (returns their team role)
 *   2. User has a direct board share entry (returns their share role)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await params;

    // Authenticate user from Bearer token
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json(
        { success: false, error: "Missing authorization token." },
        { status: 401 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Verify token and get user
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json(
        { success: false, error: "Invalid or expired token." },
        { status: 401 }
      );
    }
    const userId = userData.user.id;

    // Fetch board
    const { data: board, error: boardErr } = await supabaseAdmin
      .from("boards")
      .select("*")
      .eq("id", boardId)
      .single();

    if (boardErr || !board) {
      return NextResponse.json(
        { success: false, error: boardErr?.message ?? "Board not found" },
        { status: 404 }
      );
    }

    // 1) Team membership access
    const { data: tm, error: tmErr } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("team_id", board.team_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (tmErr) {
      return NextResponse.json(
        { success: false, error: tmErr.message },
        { status: 500 }
      );
    }

    if (tm?.role) {
      return NextResponse.json(
        { success: true, access: "team", role: tm.role, board },
        { status: 200 }
      );
    }

    // 2) Direct board share access — look up the actual role stored in board_shares
    const { data: share, error: shareErr } = await supabaseAdmin
      .from("board_shares")
      .select("role")
      .eq("board_id", boardId)
      .eq("user_id", userId)
      .maybeSingle();

    if (shareErr) {
      return NextResponse.json(
        { success: false, error: shareErr.message },
        { status: 500 }
      );
    }

    if (share) {
      // Ensure user also has team membership so they can see the team
      const { error: upErr } = await supabaseAdmin
        .from("team_members")
        .upsert(
          { team_id: board.team_id, user_id: userId, role: share.role ?? "viewer" },
          { onConflict: "team_id,user_id", ignoreDuplicates: true }
        );

      if (upErr) {
        return NextResponse.json(
          {
            success: true,
            access: "shared",
            role: share.role ?? "viewer",
            board,
            warning: `Shared access granted, but team membership upsert failed: ${upErr.message}`,
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        { success: true, access: "shared", role: share.role ?? "viewer", board },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/boards/[boardId]
 * Save board data
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  try {
    const { boardId } = await params;

    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ success: false, error: "Missing token." }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ success: false, error: "Invalid token." }, { status: 401 });
    }
    const userId = userData.user.id;

    const body = await req.json();

    // Check write access: team member with editor/admin OR board share with editor/admin
    const { data: board } = await supabaseAdmin
      .from("boards")
      .select("team_id")
      .eq("id", boardId)
      .single();

    if (!board) {
      return NextResponse.json({ success: false, error: "Board not found." }, { status: 404 });
    }

    const { data: tm } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("team_id", board.team_id)
      .eq("user_id", userId)
      .maybeSingle();

    const { data: share } = await supabaseAdmin
      .from("board_shares")
      .select("role")
      .eq("board_id", boardId)
      .eq("user_id", userId)
      .maybeSingle();

    const role = tm?.role ?? share?.role ?? "viewer";
    if (role !== "admin" && role !== "editor") {
      return NextResponse.json({ success: false, error: "Forbidden: read-only access." }, { status: 403 });
    }

    const { data: updated, error: updateErr } = await supabaseAdmin
      .from("boards")
      .update({ data: body.data, name: body.name ?? undefined })
      .eq("id", boardId)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, board: updated }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
