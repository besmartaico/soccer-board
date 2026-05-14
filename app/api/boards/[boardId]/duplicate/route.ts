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

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const supa = admin();
  const userId = await getUserId(req, supa);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Load source board
  const { data: source, error: srcErr } = await supa
    .from("boards")
    .select("id, team_id, name, data")
    .eq("id", boardId)
    .single();

  if (srcErr || !source) {
    return NextResponse.json({ error: srcErr?.message ?? "Board not found" }, { status: 404 });
  }

  // Role check on the source team
  const role = await getRole(supa, source.team_id, userId);
  if (!role || (role !== "admin" && role !== "editor")) {
    return NextResponse.json({ error: "Editor or admin required" }, { status: 403 });
  }

  // Compute a new name. If body has { name }, use it, else "Copy of <name>"
  let newName: string | null = null;
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body.name === "string" && body.name.trim()) {
      newName = body.name.trim().slice(0, 120);
    }
  } catch {}
  if (!newName) newName = ("Copy of " + (source.name ?? "Board")).slice(0, 120);

  const { data: created, error: insErr } = await supa
    .from("boards")
    .insert({
      team_id: source.team_id,
      name: newName,
      created_by: userId,
      data: source.data ?? {},
    })
    .select()
    .single();

  if (insErr || !created) {
    return NextResponse.json({ error: insErr?.message ?? "Failed to duplicate" }, { status: 500 });
  }

  return NextResponse.json({ board: created });
}
