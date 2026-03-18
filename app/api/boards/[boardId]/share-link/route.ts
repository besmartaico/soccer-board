import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (c) => c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { mode, password } = body; // mode: "view" | "edit"

  // Fetch the board
  const { data: board, error } = await supabase
    .from("boards")
    .select("id, team_id, data")
    .eq("id", boardId)
    .single();

  if (error || !board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  // Generate a random token
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  // Hash password if provided (simple SHA-256 via Web Crypto)
  let passwordHash: string | null = null;
  if (password) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(password));
    passwordHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  // Store share link in board.data.shareLinks
  const prevData = board.data && typeof board.data === "object" ? board.data : {};
  const prevLinks: ShareLink[] = (prevData as Record<string, unknown>).shareLinks as ShareLink[] || [];

  interface ShareLink { token: string; mode: string; passwordHash: string | null; createdAt: string; }

  const newLink: ShareLink = { token, mode: mode || "view", passwordHash, createdAt: new Date().toISOString() };
  const nextData = { ...prevData, shareLinks: [...prevLinks, newLink] };

  const { error: updateErr } = await supabase
    .from("boards")
    .update({ data: nextData })
    .eq("id", boardId);

  if (updateErr) return NextResponse.json({ error: "Failed to save link" }, { status: 500 });

  return NextResponse.json({ token, mode: mode || "view" });
}

// GET: resolve a token to board data (no auth required)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const password = req.nextUrl.searchParams.get("password");

  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  // Use service role or anon key - search all boards for this token
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  );

  // Find the board containing this token
  const { data: boards } = await supabase
    .from("boards")
    .select("id, name, team_id, data");

  interface ShareLink { token: string; mode: string; passwordHash: string | null; }

  const found = boards?.find(b => {
    const links: ShareLink[] = b.data?.shareLinks || [];
    return links.some((l: ShareLink) => l.token === token);
  });

  if (!found) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const links: ShareLink[] = found.data?.shareLinks || [];
  const link = links.find((l: ShareLink) => l.token === token)!;

  // Check password if required
  if (link.passwordHash) {
    if (!password) return NextResponse.json({ error: "Password required" }, { status: 401 });
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest("SHA-256", enc.encode(password));
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    if (hash !== link.passwordHash) return NextResponse.json({ error: "Wrong password" }, { status: 403 });
  }

  return NextResponse.json({
    boardId: found.id,
    boardName: found.name,
    mode: link.mode,
    data: found.data,
  });
}
