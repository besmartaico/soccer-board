import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL;

  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");
  if (!serviceRole) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY.");

  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizeEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

async function getAuthUserFromBearer(supabaseAdmin: any, req: NextRequest) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
  if (!token) return { ok: false as const, status: 401, message: "Missing Authorization token" };

  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { ok: false as const, status: 401, message: "Invalid session" };
  }

  return {
    ok: true as const,
    userId: userData.user.id,
    email: normalizeEmail(userData.user.email || ""),
  };
}

async function buildEmailToUserIdMap(
  supabaseAdmin: any,
  emails: string[]
): Promise<{ found: Record<string, string>; notFound: string[] }> {
  const wanted = new Set(emails.map(normalizeEmail).filter(Boolean));
  const found: Record<string, string> = {};

  if (wanted.size === 0) return { found, notFound: [] };

  const perPage = 200;
  let page = 1;

  // Supabase doesn't provide a direct lookup by email via auth admin.
  // This paging approach is fine for small user-bases.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
    if (error) break;

    const users = data?.users ?? [];
    for (const u of users) {
      const e = normalizeEmail(u?.email || "");
      if (e && wanted.has(e) && !found[e]) {
        found[e] = u.id;
      }
    }

    const remaining = Array.from(wanted).filter((e) => !found[e]);
    if (remaining.length === 0) break;
    if (users.length < perPage) break;
    page += 1;
    if (page > 200) break; // safety
  }

  const notFound = Array.from(wanted).filter((e) => !found[e]);
  return { found, notFound };
}

/**
 * POST /api/boards/[boardId]/share
 *
 * Body: { emails: string[] }
 *
 * - Saves board.data.sharing.emails
 * - Immediately upserts any existing users into team_members as "viewer"
 *   so the Team + Board show up for them without needing a direct-link visit.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ boardId: string }> }
) {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { boardId } = await context.params;
    const id = String(boardId || "").trim();
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing boardId" }, { status: 400 });
    }

    const auth = await getAuthUserFromBearer(supabaseAdmin, req);
    if (!auth.ok) {
      return NextResponse.json({ success: false, error: auth.message }, { status: auth.status });
    }

    const body = await req.json().catch(() => ({}));
    const cleanedEmails: string[] = Array.from(
      new Set((Array.isArray(body?.emails) ? body.emails : []).map(normalizeEmail).filter(Boolean))
    );

    const { data: board, error: boardErr } = await supabaseAdmin
      .from("boards")
      .select("id,team_id,name,data,created_at")
      .eq("id", id)
      .single();

    if (boardErr || !board) {
      return NextResponse.json(
        { success: false, error: boardErr?.message ?? "Board not found" },
        { status: 404 }
      );
    }

    // Require caller to be admin/editor on the team
    const { data: tm, error: tmErr } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("team_id", (board as any).team_id)
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (tmErr) {
      return NextResponse.json({ success: false, error: tmErr.message }, { status: 500 });
    }

    const role = String(tm?.role || "").toLowerCase();
    if (!(role === "admin" || role === "editor")) {
      return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
    }

    // Update board sharing list
    const prevData = board?.data && typeof board.data === "object" ? board.data : {};
    const nextData = {
      ...prevData,
      sharing: {
        ...(prevData as any).sharing,
        emails: cleanedEmails,
      },
    };

    const upBoard = await supabaseAdmin
      .from("boards")
      .update({ data: nextData })
      .eq("id", id)
      .select("id,team_id,name,data,created_at")
      .single();

    if (upBoard.error) {
      return NextResponse.json({ success: false, error: upBoard.error.message }, { status: 500 });
    }

    // Sync team_members for any existing users
    const { found, notFound } = await buildEmailToUserIdMap(supabaseAdmin, cleanedEmails);
    const rows = Object.entries(found).map(([_, user_id]) => ({
      team_id: (upBoard.data as any).team_id,
      user_id,
      role: "viewer",
    }));

    if (rows.length) {
      const { error: upErr } = await supabaseAdmin
        .from("team_members")
        .upsert(rows, { onConflict: "team_id,user_id" });

      if (upErr) {
        return NextResponse.json(
          {
            success: true,
            board: upBoard.data,
            synced: [],
            notFound,
            warning: `Sharing saved, but team membership upsert failed: ${upErr.message}`,
          },
          { status: 200 }
        );
      }
    }

    return NextResponse.json(
      {
        success: true,
        board: upBoard.data,
        synced: Object.keys(found),
        notFound,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { success: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
