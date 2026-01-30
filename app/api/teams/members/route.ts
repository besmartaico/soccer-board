import { NextResponse } from "next/server";
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

/**
 * Adds/updates a membership row in public.team_members.
 *
 * Today we use this for "add myself as admin" after creating a team.
 *
 * Request:
 *  POST { teamId: string, role?: 'viewer'|'editor'|'admin' }
 *
 * Auth:
 *  Uses the caller's Supabase access token (Authorization: Bearer <token>)
 *  to resolve the caller user_id, then writes membership via service role.
 */
export async function POST(req: Request) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const body = await req.json();
    const teamId = String(body.teamId || "").trim();
    const role = String(body.role || "admin").trim();

    if (!teamId) {
      return NextResponse.json({ success: false, error: "Missing teamId" }, { status: 400 });
    }

    if (!(["viewer", "editor", "admin"] as string[]).includes(role)) {
      return NextResponse.json({ success: false, error: "Invalid role" }, { status: 400 });
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    if (!token) {
      return NextResponse.json({ success: false, error: "Missing Authorization token" }, { status: 401 });
    }

    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ success: false, error: "Invalid session" }, { status: 401 });
    }

    const userId = userData.user.id;

    const { error } = await supabaseAdmin
      .from("team_members")
      .upsert(
        { team_id: teamId, user_id: userId, role },
        { onConflict: "team_id,user_id" }
      );

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
