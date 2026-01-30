import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabaseServer";

export const runtime = "nodejs";

type UserRole = "viewer" | "editor" | "admin";

function normalizeEmail(email: string) {
  return (email || "").trim().toLowerCase();
}

function isEnvAdmin(email: string | null | undefined) {
  const list = (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!email) return false;
  return list.includes(normalizeEmail(email));
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

async function isAdminUser(email: string | null | undefined) {
  const e = normalizeEmail(email || "");
  if (!e) return false;

  // First: user_roles table
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("email", e)
      .single();

    if (!error && data?.role && String(data.role).toLowerCase() === "admin") return true;
  } catch {
    // ignore (table may not exist yet)
  }

  // Bootstrap: env allowlist
  return isEnvAdmin(e);
}

async function requireAdmin() {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.auth.getUser();

  if (error) return { ok: false as const, status: 401, message: error.message };
  const email = data?.user?.email || null;
  if (!email) return { ok: false as const, status: 401, message: "Not logged in." };

  const ok = await isAdminUser(email);
  if (!ok) return { ok: false as const, status: 403, message: "Not an admin." };

  return { ok: true as const, email };
}

export async function GET() {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .select("id, email, role, created_at, updated_at")
      .order("email", { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ users: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email || "");
    const role = String(body?.role || "").toLowerCase() as UserRole;

    if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });
    if (!["viewer", "editor", "admin"].includes(role)) {
      return NextResponse.json({ error: "Role must be viewer, editor, or admin." }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ email, role }, { onConflict: "email" })
      .select("id, email, role, created_at, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ user: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const admin = await requireAdmin();
    if (!admin.ok) return NextResponse.json({ error: admin.message }, { status: admin.status });

    const body = await req.json().catch(() => ({}));
    const email = normalizeEmail(body?.email || "");

    if (!email) return NextResponse.json({ error: "Email is required." }, { status: 400 });

    // Prevent removing your last admin accidentally (best-effort)
    const supabaseAdmin = getSupabaseAdmin();

    const { data: admins, error: e1 } = await supabaseAdmin
      .from("user_roles")
      .select("email, role")
      .eq("role", "admin");

    if (!e1) {
      const adminEmails = (admins ?? []).map((r: any) => normalizeEmail(r.email));
      if (adminEmails.length <= 1 && adminEmails.includes(email)) {
        return NextResponse.json({ error: "Cannot remove the last admin." }, { status: 400 });
      }
    }

    const { error } = await supabaseAdmin.from("user_roles").delete().eq("email", email);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unexpected error" }, { status: 500 });
  }
}
