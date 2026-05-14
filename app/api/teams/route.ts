import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function getUserId(req: NextRequest, supa: ReturnType<typeof admin>) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;
  const { data, error } = await supa.auth.getUser(token);
  if (error || !data?.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

// GET /api/teams
// Returns all teams the bearer user is a member of, with their role on each.
// Used by external integrations that need to render the list of teams in their own UI.
export async function GET(req: NextRequest) {
  const supa = admin();
  const user = await getUserId(req, supa);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: memberships, error: memErr } = await supa
    .from("team_members")
    .select("team_id, role")
    .eq("user_id", user.id);

  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });

  const teamIds = (memberships ?? []).map((m: any) => m.team_id);
  if (teamIds.length === 0) {
    return NextResponse.json({ teams: [], user: { id: user.id, email: user.email } });
  }

  const { data: teams, error: teamErr } = await supa
    .from("teams")
    .select("id, name, created_at")
    .in("id", teamIds)
    .order("name");

  if (teamErr) return NextResponse.json({ error: teamErr.message }, { status: 500 });

  const roleByTeam = new Map(memberships!.map((m: any) => [m.team_id, m.role]));
  const out = (teams ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    created_at: t.created_at,
    role: roleByTeam.get(t.id) ?? "viewer",
  }));

  return NextResponse.json({ teams: out, user: { id: user.id, email: user.email } });
}
