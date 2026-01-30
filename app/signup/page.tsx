// app/signup/page.tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function onSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) throw new Error("Enter an email.");
      if (!password) throw new Error("Enter a password.");

      const { error: signUpError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
      });

      if (signUpError) throw new Error(signUpError.message);

      // IMPORTANT: Your project currently doesn't use email confirmation.
      // So we show a simple "you can now login" message.
      setSuccess("Account created. You can now log in.");
      setEmail("");
      setPassword("");

      // Optional auto-redirect
      setTimeout(() => {
        window.location.href = "/login";
      }, 1200);
    } catch (e: any) {
      setError(e?.message ?? "Failed to sign up.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-white p-6">
      <div className="w-full max-w-md border rounded-2xl p-6">
        <h1 className="text-2xl font-bold">Sign Up</h1>
        <p className="text-gray-600 mb-4">Create your account.</p>

        {error ? <div className="mb-3 text-red-600">{error}</div> : null}
        {success ? <div className="mb-3 text-green-700">{success}</div> : null}

        <form onSubmit={onSignup} className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              className="w-full border rounded px-3 py-2"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </div>

          <button
            disabled={loading}
            className="w-full rounded bg-black text-white px-4 py-2 disabled:opacity-60"
          >
            {loading ? "Creating..." : "Create account"}
          </button>
        </form>

        <div className="mt-4 text-sm text-gray-700">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Log in
          </Link>
        </div>
      </div>
    </main>
  );
}
