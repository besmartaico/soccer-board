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
  const { data } = await supa.from("team_members").select("role").eq("team_id", teamId).eq("user_id", userId).maybeSingle();
  return data?.role ?? null;
}

// POST /api/patterns/[patternId]/duplicate
// body: { targetTeamId?: string, name?: string }
// If targetTeamId is omitted, duplicates into the same team.
// Requires editor/admin on the SOURCE team AND the TARGET team.
export async function POST(req: NextRequest, { params }: { params: Promise<{ patternId: string }> }) {
  const { patternId } = await params;
  const supa = admin();
  const userId = await getUserId(req, supa);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: source, error: sErr } = await supa.from("patterns").select("*").eq("id", patternId).single();
  if (sErr || !source) return NextResponse.json({ error: "Source pattern not found" }, { status: 404 });

  // Permission on source
  const sourceRole = await getRole(supa, source.team_id, userId);
  if (!sourceRole) return NextResponse.json({ error: "Not a member of source team" }, { status: 403 });

  let body: any = {};
  try { body = await req.json(); } catch {}
  const targetTeamId = String(body?.targetTeamId ?? source.team_id);

  // Permission on target (editor/admin)
  const targetRole = await getRole(supa, targetTeamId, userId);
  if (!targetRole || (targetRole !== "admin" && targetRole !== "editor")) {
    return NextResponse.json({ error: "Editor or admin required on target team" }, { status: 403 });
  }

  const baseName = (body?.name && typeof body.name === "string" && body.name.trim()) ? body.name.trim() : ("Copy of " + (source.name ?? "Pattern"));
  const newName = baseName.slice(0, 120);

  const { data: created, error: insErr } = await supa.from("patterns").insert({
    team_id: targetTeamId,
    name: newName,
    description: source.description ?? null,
    source_board_id: targetTeamId === source.team_id ? source.source_board_id : null,
    created_by: userId,
    data: source.data ?? {},
  }).select().single();

  if (insErr || !created) return NextResponse.json({ error: insErr?.message ?? "Failed to duplicate" }, { status: 500 });
  return NextResponse.json({ pattern: created });
}
