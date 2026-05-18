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

// GET /api/teams/[teamId]/patterns
export async function GET(req: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supa = admin();
  const userId = await getUserId(req, supa);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await getRole(supa, teamId, userId);
  if (!role) return NextResponse.json({ error: "Not a team member" }, { status: 403 });

  const { data, error } = await supa
    .from("patterns")
    .select("id, name, description, source_board_id, created_at, created_by")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ patterns: data ?? [], role });
}

// POST /api/teams/[teamId]/patterns
// body: { name?: string, sourceBoardId: string }
// Copies the source board's "data" as the pattern's start state.
export async function POST(req: NextRequest, { params }: { params: Promise<{ teamId: string }> }) {
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

  const sourceBoardId = String(body?.sourceBoardId ?? "").trim();
  if (!sourceBoardId) return NextResponse.json({ error: "sourceBoardId required" }, { status: 400 });

  // Load the source board to copy its state. Must be in the same team.
  const { data: board, error: bErr } = await supa
    .from("boards")
    .select("id, team_id, name, data")
    .eq("id", sourceBoardId)
    .single();
  if (bErr || !board) return NextResponse.json({ error: "Source board not found" }, { status: 404 });
  if (board.team_id !== teamId) return NextResponse.json({ error: "Board not in this team" }, { status: 403 });

  const boardData = (board.data ?? {}) as any;
  const htmlBoard = boardData.htmlBoard ?? boardData;
  const patternData = {
    placed: htmlBoard.placedPlayers ?? htmlBoard.placed ?? [],
    objects: htmlBoard.objects ?? [],
    backgroundUrl: htmlBoard.backgroundUrl ?? null,
    bgSize: htmlBoard.bgSize,
    bgLocked: htmlBoard.bgLocked,
    cardSizeMode: htmlBoard.cardSizeMode ?? "medium",
    startPlaced: null,
    startObjects: null,
  };

  const name = String(body?.name ?? "").trim().slice(0, 120) || ("Pattern from " + (board.name ?? "Board")).slice(0, 120);

  const { data: created, error: insErr } = await supa
    .from("patterns")
    .insert({
      team_id: teamId,
      name,
      source_board_id: sourceBoardId,
      created_by: userId,
      data: patternData,
    })
    .select()
    .single();

  if (insErr || !created) return NextResponse.json({ error: insErr?.message ?? "Failed to create" }, { status: 500 });
  return NextResponse.json({ pattern: created });
}
