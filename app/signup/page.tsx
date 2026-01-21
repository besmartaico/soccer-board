"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) router.push("/app/teams");
    })();
  }, [router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    const e1 = email.trim().toLowerCase();
    if (!e1) return setErr("Enter your email.");
    if (!password) return setErr("Enter a password.");
    if (password !== password2) return setErr("Passwords do not match.");

    setLoading(true);
    try {
      // Step 1: verify invite
      const res = await fetch(`/api/auth/is-allowed?email=${encodeURIComponent(e1)}`, {
        cache: "no-store",
      });
      const json = await res.json();

      if (!res.ok) {
        throw new Error(json?.error ?? "Unable to verify invite.");
      }
      if (!json?.allowed) {
        setErr("This email is not approved to sign up. Ask the admin to invite you.");
        return;
      }

      // Step 2: create auth user
      const { error } = await supabase.auth.signUp({
        email: e1,
        password,
      });

      if (error) throw new Error(error.message);

      setMsg(
        "Account created. If email confirmation is enabled, check your email to confirm, then log in."
      );
    } catch (e: any) {
      setErr(e?.message ?? "Signup failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-white">
      <div className="w-full max-w-md border rounded-xl p-6">
        <h1 className="text-2xl font-bold">Sign Up</h1>
        <p className="text-sm text-gray-600 mt-1">
          Invite-only. Your email must be approved by an admin.
        </p>

        {err ? <div className="mt-4 text-sm text-red-600">{err}</div> : null}
        {msg ? <div className="mt-4 text-sm text-green-700">{msg}</div> : null}

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Password</label>
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Confirm password</label>
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              value={password2}
              onChange={(e) => setPassword2(e.target.value)}
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>

          <button
            className="w-full border rounded px-3 py-2 bg-gray-900 text-white disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <div className="mt-4 text-sm">
          Already have an account?{" "}
          <Link className="underline" href="/login">
            Log in
          </Link>
        </div>
      </div>
    </main>
  );
}
