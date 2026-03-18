import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

interface ShareLink { token: string; mode: string; passwordHash: string | null; createdAt: string; }

function makeSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params;
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { mode, password } = body;

  const admin = makeSupabaseServer();
  const { data: board, error } = await admin
    .from("boards").select("id, data").eq("id", boardId).single();

  if (error || !board) return NextResponse.json({ error: "Board not found" }, { status: 404 });

  const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map(b => b.toString(16).padStart(2, "0")).join("");

  let passwordHash: string | null = null;
  if (password) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    passwordHash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  const prevData = (board.data && typeof board.data === "object") ? board.data as Record<string, unknown> : {};
  const prevLinks: ShareLink[] = (prevData.shareLinks as ShareLink[]) || [];
  const newLink: ShareLink = { token, mode: mode || "view", passwordHash, createdAt: new Date().toISOString() };

  await admin.from("boards").update({ data: { ...prevData, shareLinks: [...prevLinks, newLink] } }).eq("id", boardId);

  return NextResponse.json({ token, mode: mode || "view" });
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const password = req.nextUrl.searchParams.get("password");
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  const admin = makeSupabaseServer();
  const { data: boards } = await admin.from("boards").select("id, name, data");

  const found = boards?.find(b => {
    const links: ShareLink[] = (b.data?.shareLinks as ShareLink[]) || [];
    return links.some(l => l.token === token);
  });

  if (!found) return NextResponse.json({ error: "Invalid link" }, { status: 404 });

  const links: ShareLink[] = (found.data?.shareLinks as ShareLink[]) || [];
  const link = links.find(l => l.token === token)!;

  if (link.passwordHash) {
    if (!password) return NextResponse.json({ error: "Password required" }, { status: 401 });
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
    if (hash !== link.passwordHash) return NextResponse.json({ error: "Wrong password" }, { status: 403 });
  }

  return NextResponse.json({ boardId: found.id, boardName: found.name, mode: link.mode, data: found.data });
}
