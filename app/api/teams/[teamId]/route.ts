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

export async function PATCH(
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

  const name = typeof body?.name === "string" ? body.name.trim() : null;
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (name.length > 80) return NextResponse.json({ error: "Name too long (max 80)" }, { status: 400 });

  const { data, error } = await supa
    .from("teams")
    .update({ name })
    .eq("id", teamId)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ team: data });
}
