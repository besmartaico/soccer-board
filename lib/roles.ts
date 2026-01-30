// lib/roles.ts
import { supabase } from "@/lib/supabaseClient";

export type UserRole = "viewer" | "editor" | "admin";

function envAdminEmails(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isEnvAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return envAdminEmails().includes(email.trim().toLowerCase());
}

/**
 * Best-effort role lookup for the currently logged-in user.
 * - Tries user_roles table first (recommended)
 * - Falls back to NEXT_PUBLIC_ADMIN_EMAILS allowlist for bootstrap
 * - Defaults to "viewer"
 */
export async function getMyRole(): Promise<UserRole> {
  const { data } = await supabase.auth.getUser();
  const email = data?.user?.email?.toLowerCase() || null;

  if (!email) return "viewer";

  try {
    const res = await supabase
      .from("user_roles")
      .select("role")
      .eq("email", email)
      .single();

    if (!res.error && res.data?.role) {
      const r = String(res.data.role).toLowerCase();
      if (r === "admin" || r === "editor" || r === "viewer") return r as UserRole;
    }
  } catch {
    // ignore (table/policy may not exist yet)
  }

  // bootstrap: env-based admin
  if (isEnvAdmin(email)) return "admin";

  return "viewer";
}
