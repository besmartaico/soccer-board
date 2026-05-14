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
  return data.user.id;
}

async function getRole(supa: ReturnType<typeof admin>, teamId: string, userId: string) {
  const { data } = await supa
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  return data?.role ?? null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const supa = admin();
  const userId = await getUserId(req, supa);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getRole(supa, teamId, userId);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supa
    .from("team_roster")
    .select("*")
    .eq("team_id", teamId)
    .order("jersey_number", { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ players: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const supa = admin();
  const userId = await getUserId(req, supa);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getRole(supa, teamId, userId);
  if (!role || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Editor or admin required" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const players = Array.isArray(body?.players) ? body.players : null;
  if (!players) return NextResponse.json({ error: "Missing players array" }, { status: 400 });

  // Validate required fields
  for (const p of players) {
    if (!p?.external_id || !p?.name || !p?.picture_url || p?.jersey_number == null) {
      return NextResponse.json({
        error: "Each player requires external_id, name, picture_url, jersey_number"
      }, { status: 400 });
    }
  }

  // Replace strategy: delete then insert all rows for this team
  const del = await supa.from("team_roster").delete().eq("team_id", teamId);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 500 });

  const rows = players.map((p: any) => ({
    team_id: teamId,
    external_id: String(p.external_id),
    name: String(p.name),
    picture_url: String(p.picture_url),
    jersey_number: Number(p.jersey_number),
    extra: p.extra ?? {},
  }));

  const { error: insErr } = await supa.from("team_roster").insert(rows);
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ success: true, count: rows.length });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const supa = admin();
  const userId = await getUserId(req, supa);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await getRole(supa, teamId, userId);
  if (role !== "admin") return NextResponse.json({ error: "Admin required" }, { status: 403 });

  const { error } = await supa.from("team_roster").delete().eq("team_id", teamId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
