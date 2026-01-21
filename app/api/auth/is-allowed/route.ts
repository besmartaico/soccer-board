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
    const emailRaw = (searchParams.get("email") || "").trim().toLowerCase();

    if (!emailRaw) {
      return NextResponse.json({ allowed: false, error: "Missing email" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin
      .from("allowed_users")
      .select("email")
      .eq("email", emailRaw)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ allowed: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ allowed: !!data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { allowed: false, error: e?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
