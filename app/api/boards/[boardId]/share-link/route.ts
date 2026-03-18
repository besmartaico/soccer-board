import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

interface ShareLink { token: string; mode: string; passwordHash: string | null; createdAt: string; }

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

async function hashPassword(password: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { mode, password } = await req.json();
  const db = adminClient();

  const { data: board, error } = await db.from("boards").select("id, data").eq("id", boardId).single();
  if (error || !board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  const passwordHash = password ? await hashPassword(password) : null;
  const prevData = (board.data && typeof board.data === "object") ? board.data as Record<string, unknown> : {};
  const prevLinks: ShareLink[] = (prevData.shareLinks as ShareLink[]) || [];
  const newLink: ShareLink = { token, mode: mode || "view", passwordHash, createdAt: new Date().toISOString() };

  await db.from("boards").update({ data: { ...prevData, shareLinks: [...prevLinks, newLink] } }).eq("id", boardId);
  return NextResponse.json({ token, mode: mode || "view" });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const password = req.nextUrl.searchParams.get("password");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const db = adminClient();
  const { data: boards } = await db.from("boards").select("id, name, data");

  const found = boards?.find(b => {
    const links: ShareLink[] = (b.data?.shareLinks as ShareLink[]) || [];
    return links.some((l: ShareLink) => l.token === token);
  });
  if (!found) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const links: ShareLink[] = (found.data?.shareLinks as ShareLink[]) || [];
  const link = links.find((l: ShareLink) => l.token === token)!;

  if (link.passwordHash) {
    if (!password) return NextResponse.json({ error: "Password required" }, { status: 401 });
    const hash = await hashPassword(password);
    if (hash !== link.passwordHash) return NextResponse.json({ error: "Wrong password" }, { status: 403 });
  }

  return NextResponse.json({ boardId: found.id, boardName: found.name, mode: link.mode, data: found.data });
}
