import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) throw new Error("Missing Supabase env vars.");
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * POST /api/teams/share
 * Share a team with another user by email.
 * Body: { teamId, email, role }
 */
export async function POST(req: NextRequest) {
  try {
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
    const requestingUserId = userData.user.id;

    const body = await req.json();
    const { teamId, email, role = "viewer" } = body;

    if (!teamId || !email) {
      return NextResponse.json(
        { success: false, error: "teamId and email are required." },
        { status: 400 }
      );
    }

    // Verify requester is admin or editor on this team
    const { data: myMembership } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", requestingUserId)
      .maybeSingle();

    if (!myMembership || (myMembership.role !== "admin" && myMembership.role !== "editor")) {
      return NextResponse.json(
        { success: false, error: "Forbidden: editor or admin access required." },
        { status: 403 }
      );
    }

    // Look up the target user by email
    const { data: users, error: listErr } = await supabaseAdmin.auth.admin.listUsers();
    if (listErr) {
      return NextResponse.json({ success: false, error: listErr.message }, { status: 500 });
    }

    const targetUser = users.users.find(
      (u: any) => u.email?.toLowerCase() === email.trim().toLowerCase()
    );

    if (!targetUser) {
      return NextResponse.json(
        {
          success: false,
          error: `No account found for ${email}. They must sign up first.`,
        },
        { status: 404 }
      );
    }

    // Upsert team membership for the target user
    const { error: upsertErr } = await supabaseAdmin
      .from("team_members")
      .upsert(
        { team_id: teamId, user_id: targetUser.id, role },
        { onConflict: "team_id,user_id" }
      );

    if (upsertErr) {
      return NextResponse.json({ success: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json(
      { success: true, message: `Team shared with ${email} as ${role}.` },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
