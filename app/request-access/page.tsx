"use client";

import { useState } from "react";
import Link from "next/link";

export default function RequestAccessPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOkMsg(null);

    const e1 = email.trim().toLowerCase();
    if (!e1) return setErr("Enter your email.");

    setLoading(true);
    try {
      const res = await fetch("/api/auth/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e1, message }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to submit request.");

      setOkMsg("Request submitted. If approved, you’ll receive an invite link.");
      setEmail("");
      setMessage("");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-white">
      <div className="w-full max-w-md border rounded-xl p-6">
        <h1 className="text-2xl font-bold">Request Access</h1>
        <p className="text-sm text-gray-600 mt-1">
          Enter your email. An admin will review and send you an invite link if approved.
        </p>

        {err ? <div className="mt-4 text-sm text-red-600">{err}</div> : null}
        {okMsg ? <div className="mt-4 text-sm text-green-700">{okMsg}</div> : null}

        <form className="mt-5 space-y-3" onSubmit={submit}>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input
              className="mt-1 w-full border rounded px-3 py-2"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@school.org"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Message (optional)</label>
            <textarea
              className="mt-1 w-full border rounded px-3 py-2"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Coach name, role, etc."
              rows={3}
            />
          </div>

          <button
            className="w-full border rounded px-3 py-2 bg-gray-900 text-white disabled:opacity-60"
            disabled={loading}
            type="submit"
          >
            {loading ? "Submitting..." : "Submit request"}
          </button>
        </form>

        <div className="mt-4 text-sm">
          <Link className="underline" href="/">
            Back
          </Link>
        </div>
      </div>
    </main>
  );
}
