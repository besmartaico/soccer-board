import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Json = Record<string, any>;

type TeamRole = "viewer" | "editor" | "admin";

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL;

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL). ");
  if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// GET /api/teams/[teamId]/boards
// Returns the list of boards in a team. The bearer user must be a member of the team.
// Used by external integrations to render boards inside their own UI.
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ teamId: string }> }
): Promise<Response> {
  try {
    const { teamId } = await ctx.params;
    const team_id = String(teamId || "").trim();
    if (!team_id) {
      return NextResponse.json({ success: false, error: "Missing teamId" }, { status: 400 });
    }

    const supa = getSupabaseAdmin();

    // Auth
    const authHeader = req.headers.get("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const { data: udata, error: uerr } = await supa.auth.getUser(token);
    if (uerr || !udata?.user) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }
    const user = udata.user;

    // Membership check
    const { data: mem, error: memErr } = await supa
      .from("team_members")
      .select("role")
      .eq("team_id", team_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memErr) {
      return NextResponse.json({ success: false, error: memErr.message }, { status: 500 });
    }
    if (!mem) {
      return NextResponse.json({ success: false, error: "Not a member of this team" }, { status: 403 });
    }

    // Boards
    const { data: boards, error: bErr } = await supa
      .from("boards")
      .select("id, name, created_at, data")
      .eq("team_id", team_id)
      .order("created_at", { ascending: false });

    if (bErr) {
      return NextResponse.json({ success: false, error: bErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      role: (mem as any).role,
      boards: boards ?? [],
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ teamId: string }> }
): Promise<Response> {
  try {
    const { teamId } = await ctx.params;
    const team_id = String(teamId || "").trim();
    if (!team_id) {
      return NextResponse.json({ success: false, error: "Missing teamId" }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return NextResponse.json({ success: false, error: "Missing Authorization token" }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Validate user from access token
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ success: false, error: "Invalid session" }, { status: 401 });
    }

    const user = userData.user;

    const body = (await req.json().catch(() => ({}))) as Json;
    const name = String(body?.name || "").trim();
    const data = body?.data && typeof body.data === "object" ? body.data : {};

    if (!name) {
      return NextResponse.json({ success: false, error: "Missing board name" }, { status: 400 });
    }

    // Authorization: must be editor/admin on this team
    const mem = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("team_id", team_id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (mem.error) {
      return NextResponse.json({ success: false, error: mem.error.message }, { status: 500 });
    }

    const role = (mem.data?.role || null) as TeamRole | null;
    if (!role || (role !== "admin" && role !== "editor")) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    const ins = await supabaseAdmin
      .from("boards")
      .insert([
        {
          team_id,
          name,
          data,
          created_by: user.id,
        },
      ])
      .select("id,team_id,name,data,created_at")
      .single();

    if (ins.error) {
      return NextResponse.json({ success: false, error: ins.error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, board: ins.data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
