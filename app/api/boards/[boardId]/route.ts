import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

// NOTE: Next.js 16 route handlers type `context.params` as a Promise.
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

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(
      token
    );
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

    // 1) Team membership role (admin/editor/viewer)
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

    // 2) Shared email access (viewer only)
    const sharedEmails: string[] =
      (board as any)?.data?.sharing?.emails &&
      Array.isArray((board as any).data.sharing.emails)
        ? ((board as any).data.sharing.emails as any[])
            .map((e) => String(e || "").toLowerCase())
            .filter(Boolean)
        : [];

    if (userEmail && sharedEmails.includes(userEmail)) {
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
