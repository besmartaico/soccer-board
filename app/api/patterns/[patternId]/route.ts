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

// GET /api/patterns/[patternId]
export async function GET(req: NextRequest, { params }: { params: Promise<{ patternId: string }> }) {
  const { patternId } = await params;
  const supa = admin();
  const userId = await getUserId(req, supa);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: pat, error } = await supa.from("patterns").select("*").eq("id", patternId).single();
  if (error || !pat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await getRole(supa, pat.team_id, userId);
  if (!role) return NextResponse.json({ error: "Not a team member" }, { status: 403 });

  return NextResponse.json({ pattern: pat, role });
}

// PATCH /api/patterns/[patternId]
// body: { name?: string, description?: string, data?: object }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ patternId: string }> }) {
  const { patternId } = await params;
  const supa = admin();
  const userId = await getUserId(req, supa);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: pat, error: lErr } = await supa.from("patterns").select("team_id").eq("id", patternId).single();
  if (lErr || !pat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await getRole(supa, pat.team_id, userId);
  if (!role || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Editor or admin required" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const updates: any = {};
  if (typeof body?.name === "string") updates.name = body.name.trim().slice(0, 120);
  if (typeof body?.description === "string") updates.description = body.description.slice(0, 2000);
  if (body?.data && typeof body.data === "object") updates.data = body.data;
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const { data: updated, error: uErr } = await supa.from("patterns").update(updates).eq("id", patternId).select().single();
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 });
  return NextResponse.json({ pattern: updated });
}

// DELETE /api/patterns/[patternId]
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ patternId: string }> }) {
  const { patternId } = await params;
  const supa = admin();
  const userId = await getUserId(req, supa);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: pat, error: lErr } = await supa.from("patterns").select("team_id").eq("id", patternId).single();
  if (lErr || !pat) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const role = await getRole(supa, pat.team_id, userId);
  if (!role || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Editor or admin required" }, { status: 403 });
  }

  const { error: dErr } = await supa.from("patterns").delete().eq("id", patternId);
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
