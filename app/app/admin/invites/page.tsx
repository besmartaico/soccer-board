"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type InviteRow = { email: string; created_at: string };

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
 * - Server enforcement is in /api/admin/invites
 * - This client-side check just improves UX. It is not security.
 */
export default function AdminInvitesPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ email: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [invites, setInvites] = useState<InviteRow[]>([]);

  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);

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
      const res = await fetch("/api/admin/invites", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load invites.");
      setInvites(json?.invites ?? []);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load invites.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!me?.email) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.email]);

  async function addInvite() {
    setErr(null);
    const e1 = newEmail.trim().toLowerCase();
    if (!e1) return setErr("Enter an email to invite.");

    setSaving(true);
    try {
      const res = await fetch("/api/admin/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: e1 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to add invite.");
      setNewEmail("");
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to add invite.");
    } finally {
      setSaving(false);
    }
  }

  async function removeInvite(email: string) {
    setErr(null);
    const ok = window.confirm(`Remove invite for "${email}"?`);
    if (!ok) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/invites?email=${encodeURIComponent(email)}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to remove invite.");
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to remove invite.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="min-h-screen p-6 bg-white">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Invites</h1>
          <div className="flex items-center gap-3 text-sm sb-no-print">
            <Link className="underline" href="/app/teams">
              Teams
            </Link>
            <Link className="underline" href="/app/admin">
              Admin
            </Link>
            <Link className="underline" href="/app/admin/requests">
              Requests
            </Link>
          </div>
        </div>

        <div className="mt-2 text-sm text-gray-600">
          Signed in as: <span className="font-medium">{me?.email ?? "..."}</span>
        </div>

        {/* UX-only admin hint */}
        {!isMeAdmin ? (
          <div className="mt-3 text-sm text-amber-700">
            Note: Your email is not listed in <code>NEXT_PUBLIC_ADMIN_EMAILS</code>. You may still
            be blocked by the server if you’re not in <code>ADMIN_EMAILS</code>.
          </div>
        ) : null}

        {err ? <div className="mt-4 text-sm text-red-600">{err}</div> : null}

        <div className="mt-6 border rounded-xl p-4">
          <div className="font-semibold">Invite an email</div>
          <div className="mt-2 flex gap-2">
            <input
              className="flex-1 border rounded px-3 py-2"
              placeholder="coach@school.org"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            <button
              className="border rounded px-4 py-2 bg-gray-900 text-white disabled:opacity-60"
              onClick={addInvite}
              disabled={saving}
              type="button"
            >
              {saving ? "Saving..." : "Add"}
            </button>
          </div>
        </div>

        <div className="mt-6 border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Invited emails</div>
            <button
              className="border rounded px-3 py-1 text-sm bg-white disabled:opacity-60"
              onClick={refresh}
              disabled={loading || saving}
              type="button"
            >
              {loading ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div className="mt-3">
            {loading ? (
              <div className="text-sm">Loading…</div>
            ) : invites.length === 0 ? (
              <div className="text-sm text-gray-600">No invited emails yet.</div>
            ) : (
              <div className="divide-y">
                {invites.map((x) => (
                  <div key={x.email} className="py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{x.email}</div>
                      <div className="text-xs text-gray-500">
                        Added {new Date(x.created_at).toLocaleString()}
                      </div>
                    </div>
                    <button
                      className="border rounded px-3 py-1 text-sm bg-white disabled:opacity-60"
                      onClick={() => removeInvite(x.email)}
                      disabled={saving}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
