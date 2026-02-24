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
 *  - requester is a member of the board's team (team_members), OR
 *  - requester's email is listed in board.data.sharing.emails
 *
 * If access is granted via board share (email), we ALSO upsert the requester into
 * team_members as viewer. This ensures the TEAM becomes visible after the share,
 * matching the "board share implies team share" requirement.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ boardId: string }> }
) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { boardId } = await context.params;

    const id = String(boardId || "").trim();
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Missing boardId" },
        { status: 400 }
      );
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7)
      : "";

    if (!token) {
      return NextResponse.json(
        { success: false, error: "Missing Authorization token" },
        { status: 401 }
      );
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json(
        { success: false, error: "Invalid session" },
        { status: 401 }
      );
    }

    const userId = userData.user.id;
    const userEmail = (userData.user.email || "").toLowerCase();

    const { data: board, error: boardErr } = await supabaseAdmin
      .from("boards")
      .select("id,team_id,name,data,created_at")
      .eq("id", id)
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

    // 2) Shared email access
    const sharedEmails: string[] = Array.isArray((board as any)?.data?.sharing?.emails)
      ? ((board as any).data.sharing.emails as any[])
          .map((e) => String(e || "").trim().toLowerCase())
          .filter(Boolean)
      : [];

    if (userEmail && sharedEmails.includes(userEmail)) {
      // IMPORTANT: board share implies team share
      // Add the user to the team as viewer so it shows up in Teams / Boards lists.
      const { error: upErr } = await supabaseAdmin
        .from("team_members")
        .upsert(
          { team_id: board.team_id, user_id: userId, role: "viewer" },
          { onConflict: "team_id,user_id" }
        );

      if (upErr) {
        // still allow board view, but report that membership sync failed
        return NextResponse.json(
          {
            success: true,
            access: "shared",
            role: "viewer",
            board,
            warning: `Shared access granted, but team membership upsert failed: ${upErr.message}`,
          },
          { status: 200 }
        );
      }

      return NextResponse.json(
        { success: true, access: "shared", role: "viewer", board },
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
