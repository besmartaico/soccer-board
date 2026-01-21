"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const token = (sp.get("token") || "").trim();
  const emailFromLink = (sp.get("email") || "").trim().toLowerCase();

  const [email, setEmail] = useState(emailFromLink);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const linkReady = useMemo(() => !!token && !!emailFromLink, [token, emailFromLink]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (data?.user) router.push("/app/teams");
    })();
  }, [router]);

  useEffect(() => {
    (async () => {
      setErr(null);
      setMsg(null);

      if (!linkReady) {
        setAllowed(false);
        setChecking(false);
        return;
      }

      setChecking(true);
      try {
        const res = await fetch(
          `/api/auth/verify-invite?email=${encodeURIComponent(emailFromLink)}&token=${encodeURIComponent(
            token
          )}`,
          { cache: "no-store" }
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error ?? "Unable to verify invite.");
        setAllowed(!!json?.allowed);
        if (!json?.allowed) setErr("This invite link is invalid or expired.");
      } catch (e: any) {
        setAllowed(false);
        setErr(e?.message ?? "Unable to verify invite.");
      } finally {
        setChecking(false);
      }
    })();
  }, [linkReady, emailFromLink, token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    const e1 = email.trim().toLowerCase();
    if (!e1) return setErr("Enter your email.");
    if (e1 !== emailFromLink) return setErr("Email must match the invite link.");
    if (!token) return setErr("Missing invite token.");
    if (!allowed) return setErr("Invite is invalid or expired.");
    if (!password) return setErr("Enter a password.");
    if (password !== password2) return setErr("Passwords do not match.");

    setLoading(true);
    try {
      // Create auth user
      const { error } = await supabase.auth.signUp({
        email: e1,
        password,
      });

      if (error) throw new Error(error.message);

      // Mark invite used (single-use)
      const res = await fetch("/api/auth/consume-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e1, token }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to consume invite.");

      setMsg(
        "Account created. If email confirmation is enabled, check your email to confirm, then log in."
      );
    } catch (e: any) {
      setErr(e?.message ?? "Signup failed.");
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-white">
        <div className="text-sm text-gray-600">Verifying invite…</div>
      </main>
    );
  }

  if (!linkReady) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md border rounded-xl p-6">
          <h1 className="text-2xl font-bold">Invite Required</h1>
          <p className="text-sm text-gray-600 mt-2">
            You need an invite link to create an account.
          </p>
          <div className="mt-4">
            <Link className="underline" href="/request-access">
              Request Access
            </Link>
          </div>
          <div className="mt-2 text-sm">
            Already have an account?{" "}
            <Link className="underline" href="/login">
              Log in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-white">
        <div className="w-full max-w-md border rounded-xl p-6">
          <h1 className="text-2xl font-bold">Invite Invalid</h1>
          <p className="text-sm text-gray-600 mt-2">{err ?? "This invite link is invalid."}</p>
          <div className="mt-4">
            <Link className="underline" href="/request-access">
              Request Access
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-white">
      <div className="w-full max-w-md border rounded-xl p-6">
        <h1 className="text-2xl font-bold">Create Account</h1>
        <p className="text-sm text-gray-600 mt-1">Your invite has been verified.</p>

        {err ? <div className="mt-4 text-sm text-red-600">{err}</div> : null}
        {msg ? <div className="mt-4 text-sm text-green-700">{msg}</div> : null}

        <form className="mt-5 space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              className="mt-1 w-full border rounded px-3 py-2 bg-gray-50"
              value={email}
              readOnly
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
