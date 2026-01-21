import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Admin allowlist (server-enforced)
 * Set: ADMIN_EMAILS=jeff@besmartai.co,other@x.com
 */
function isAdminEmail(email: string | null | undefined) {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!email) return false;
  return list.includes(email.trim().toLowerCase());
}

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

function getSupabaseAnonServer() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_PROJECT_URL;

  const anon =
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_KEY;

  if (!url) throw new Error("Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL).");
  if (!anon) throw new Error("Missing SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).");

  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        cookie: cookies().toString(),
      },
    },
  });
}

async function requireAdmin() {
  const supabase = getSupabaseAnonServer();
  const { data, error } = await supabase.auth.getUser();

  if (error) return { ok: false as const, status: 401, message: error.message };
  const email = data?.user?.email || null;

  if (!email) return { ok: false as const, status: 401, message: "Not logged in." };
  if (!isAdminEmail(email)) return { ok: false as const, status: 403, message: "Not an admin." };

  return { ok: true as const, email };
}

function randomToken() {
  // Strong enough for invite links; stored server-side.
  // (Uses Web Crypto when available)
  const buf = new Uint8Array(32);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
  } else {
    // fallback (shouldn't hit on modern runtimes)
    for (let i = 0; i < buf.length; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  return Buffer.from(buf).toString("base64url");
}

function buildInviteLink(email: string, token: string) {
  // User requested this fixed domain.
  const base = "https://lpsoccer.besmartai.co";
  return `${base}/signup?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}`;
}

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("access_requests")
      .select("id, email, message, created_at")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ requests: data ?? [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

/**
 * POST body:
 * { email: string, expiresInDays?: number }
 *
 * Creates a single-use invite link in signup_invites and returns the link.
 */
export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

    const body = await req.json().catch(() => ({}));
    const email = (body?.email || "").toString().trim().toLowerCase();
    const expiresInDaysRaw = body?.expiresInDays;

    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });

    const expiresInDays =
      typeof expiresInDaysRaw === "number" && expiresInDaysRaw > 0 ? expiresInDaysRaw : 7;

    const token = randomToken();

    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString();

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from("signup_invites").insert([
      {
        email,
        token,
        expires_at: expiresAt,
      },
    ]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const link = buildInviteLink(email, token);
    return NextResponse.json({ ok: true, link, expires_at: expiresAt }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}

/**
 * DELETE ?id=<access_request_id>
 * Deletes the request row after it’s handled.
 */
export async function DELETE(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

    const { searchParams } = new URL(req.url);
    const id = (searchParams.get("id") || "").trim();

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from("access_requests").delete().eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
