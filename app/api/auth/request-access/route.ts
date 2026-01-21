import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function isValidEmail(email: string) {
  // Simple validation (good enough for request-access)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = (body?.email || "").toString().trim().toLowerCase();
    const message = (body?.message || "").toString();

    if (!email) return NextResponse.json({ error: "Missing email" }, { status: 400 });
    if (!isValidEmail(email)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });

    const supabaseAdmin = getSupabaseAdmin();

    // Optional: prevent endless duplicates by same email
    // (If you want duplicates allowed, remove this block.)
    const { data: existing, error: existingErr } = await supabaseAdmin
      .from("access_requests")
      .select("id")
      .eq("email", email)
      .limit(1);

    if (existingErr) {
      return NextResponse.json({ error: existingErr.message }, { status: 500 });
    }

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { ok: true, message: "Request already received." },
        { status: 200 }
      );
    }

    const { error } = await supabaseAdmin.from("access_requests").insert([{ email, message }]);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Server error" }, { status: 500 });
  }
}
