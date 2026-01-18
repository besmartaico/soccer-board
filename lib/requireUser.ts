import { supabase } from "@/lib/supabaseClient";

export async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
