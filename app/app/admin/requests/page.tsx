"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type AccessRequest = {
  id: string;
  email: string;
  message: string | null;
  created_at: string;
};

function isAdmin(email: string | null | undefined) {
  const list = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!email) return false;
  return list.includes(email.trim().toLowerCase());
}

/**
 * NOTE:
 * - Server enforcement is in /api/admin/requests using ADMIN_EMAILS.
 * - This client-side check is only for nicer UX.
 */
export default function AdminRequestsPage() {
  const router = useRouter();

  const [me, setMe] = useState<{ email: string } | null>(null);
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const isMeAdmin = useMemo(() => isAdmin(me?.email), [me?.email]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        router.push("/login");
        return;
      }
      setMe({ email: data.user.email || "" });
    })();
  }, [router]);

  async function refresh() {
    setErr(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/requests", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load requests.");
      setRequests(json?.requests ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load requests.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!me?.email) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.email]);

  async function generateInvite(email: string) {
    setErr(null);
    setToast(null);
    setBusyId(email);

    try {
      const res = await fetch("/api/admin/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, expiresInDays: 7 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to generate invite.");

      const link = json?.link as string;
      await navigator.clipboard.writeText(link);

      setToast(`Invite link copied for ${email}`);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to generate invite.");
    } finally {
      setBusyId(null);
      setTimeout(() => setToast(null), 3500);
    }
  }

  async function deleteRequest(id: string) {
    setErr(null);
    setToast(null);

    const ok = window.confirm("Delete this request?");
    if (!ok) return;

    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/requests?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to delete request.");

      setRequests((prev) => prev.filter((r) => r.id !== id));
      setToast("Request deleted");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to delete request.");
    } finally {
      setBusyId(null);
      setTimeout(() => setToast(null), 3500);
    }
  }

  return (
    <main className="min-h-screen p-6 bg-white">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold">Access Requests</h1>
          <div className="flex items-center gap-3 text-sm">
            <Link className="underline" href="/app/admin/invites">
              Invites
            </Link>
            <Link className="underline" href="/app/teams">
              Teams
            </Link>
            <Link className="underline" href="/">
              Home
            </Link>
          </div>
        </div>

        <div className="mt-2 text-sm text-gray-600">
          Signed in as: <span className="font-medium">{me?.email ?? "..."}</span>
        </div>

        {!isMeAdmin ? (
          <div className="mt-3 text-sm text-amber-700">
            Note: Your email is not listed in <code>NEXT_PUBLIC_ADMIN_EMAILS</code>. Server access is
            enforced by <code>ADMIN_EMAILS</code>.
          </div>
        ) : null}

        {err ? <div className="mt-4 text-sm text-red-600">{err}</div> : null}
        {toast ? <div className="mt-4 text-sm text-green-700">{toast}</div> : null}

        <div className="mt-6 border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Pending requests</div>
            <button
              className="border rounded px-3 py-1 text-sm bg-white disabled:opacity-60"
              type="button"
              onClick={refresh}
              disabled={loading || !!busyId}
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="mt-3">
            {loading ? (
              <div className="text-sm">Loading…</div>
            ) : requests.length === 0 ? (
              <div className="text-sm text-gray-600">No access requests yet.</div>
            ) : (
              <div className="divide-y">
                {requests.map((r) => {
                  const isBusy = busyId === r.id || busyId === r.email;
                  return (
                    <div key={r.id} className="py-3 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.email}</div>
                        <div className="text-xs text-gray-500">
                          Requested {new Date(r.created_at).toLocaleString()}
                        </div>
                        {r.message ? (
                          <div className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">
                            {r.message}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          className="border rounded px-3 py-1 text-sm bg-gray-900 text-white disabled:opacity-60"
                          type="button"
                          onClick={() => generateInvite(r.email)}
                          disabled={isBusy}
                          title="Generates a single-use invite link and copies it"
                        >
                          {busyId === r.email ? "Generating..." : "Generate invite link"}
                        </button>

                        <button
                          className="border rounded px-3 py-1 text-sm bg-white disabled:opacity-60"
                          type="button"
                          onClick={() => deleteRequest(r.id)}
                          disabled={isBusy}
                        >
                          {busyId === r.id ? "Deleting..." : "Delete request"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-4 text-xs text-gray-500">
            “Generate invite link” copies a link like:
            <div className="mt-1 font-mono break-all">
              https://lpsoccer.besmartai.co/signup?email=...&token=...
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
