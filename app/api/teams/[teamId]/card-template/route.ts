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

async function memberRole(supa: ReturnType<typeof admin>, teamId: string, userId: string) {
  const { data } = await supa
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as any)?.role ?? null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const supa = admin();
  const userId = await getUserId(req, supa);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await memberRole(supa, teamId, userId);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data, error } = await supa
    .from("team_card_template")
    .select("rows, cols, slots, updated_at")
    .eq("team_id", teamId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ template: data ?? null, role });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ teamId: string }> }
) {
  const { teamId } = await params;
  const supa = admin();
  const userId = await getUserId(req, supa);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const role = await memberRole(supa, teamId, userId);
  if (role !== "admin") return NextResponse.json({ error: "Admin only" }, { status: 403 });

  const body = await req.json();
  const rows = Number(body?.rows);
  const cols = Number(body?.cols);
  const slots = body?.slots;
  if (!Number.isFinite(rows) || rows < 1 || rows > 12) return NextResponse.json({ error: "Invalid rows" }, { status: 400 });
  if (!Number.isFinite(cols) || cols < 1 || cols > 12) return NextResponse.json({ error: "Invalid cols" }, { status: 400 });
  if (!Array.isArray(slots)) return NextResponse.json({ error: "Invalid slots" }, { status: 400 });

  // Validate slots and ensure required core fields are present
  const used = new Set<string>();
  for (const s of slots) {
    if (typeof s?.row !== "number" || typeof s?.col !== "number") return NextResponse.json({ error: "Slot missing row/col" }, { status: 400 });
    if (s.row < 0 || s.row >= rows || s.col < 0 || s.col >= cols) return NextResponse.json({ error: "Slot out of bounds" }, { status: 400 });
    if (typeof s.field !== "string" || !s.field) return NextResponse.json({ error: "Slot missing field" }, { status: 400 });
    used.add(s.field);
  }
  for (const required of ["photo", "name", "jersey_number"]) {
    if (!used.has(required)) return NextResponse.json({ error: `Template must include ${required}` }, { status: 400 });
  }

  const payload = { team_id: teamId, rows, cols, slots, updated_at: new Date().toISOString() };
  const { error } = await supa.from("team_card_template").upsert(payload, { onConflict: "team_id" });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
