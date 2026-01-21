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

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const email = (searchParams.get("email") || "").trim().toLowerCase();
    const token = (searchParams.get("token") || "").trim();

    if (!email || !token) {
      return NextResponse.json({ allowed: false, error: "Missing email or token" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("signup_invites")
      .select("email, expires_at, used_at")
      .eq("token", token)
      .maybeSingle();

    if (error) return NextResponse.json({ allowed: false, error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ allowed: false }, { status: 200 });

    if ((data.email || "").toLowerCase() !== email) return NextResponse.json({ allowed: false }, { status: 200 });
    if (data.used_at) return NextResponse.json({ allowed: false }, { status: 200 });

    if (data.expires_at) {
      const exp = new Date(data.expires_at).getTime();
      if (!Number.isNaN(exp) && Date.now() > exp) return NextResponse.json({ allowed: false }, { status: 200 });
    }

    return NextResponse.json({ allowed: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ allowed: false, error: e?.message ?? "Server error" }, { status: 500 });
  }
}
