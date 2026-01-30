"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getMyRole, type UserRole } from "@/lib/roles";

type RoleRow = {
  id: string;
  email: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
};

export default function AdminUsersPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole>("viewer");

  const [rows, setRows] = useState<RoleRow[]>([]);
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("viewer");
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);

    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp.user) {
      router.push("/login");
      return;
    }

    const r = await getMyRole();
    setRole(r);
    if (r !== "admin") {
      router.push("/app/teams");
      return;
    }

    const res = await fetch("/api/admin/users", { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error ?? "Failed to load users.");
      setLoading(false);
      return;
    }

    setRows((json.users ?? []) as RoleRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => {
    const copy = [...rows];
    copy.sort((a, b) => a.email.localeCompare(b.email));
    return copy;
  }, [rows]);

  async function upsert() {
    setSaving(true);
    setError(null);

    try {
      const em = email.trim().toLowerCase();
      if (!em) throw new Error("Email is required.");

      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, role: newRole }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to save.");

      const updated = json.user as RoleRow;
      setRows((cur) => {
        const idx = cur.findIndex((r) => r.email === updated.email);
        if (idx >= 0) {
          const next = [...cur];
          next[idx] = updated;
          return next;
        }
        return [...cur, updated];
      });

      setEmail("");
      setNewRole("viewer");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(emailToRemove: string) {
    const ok = window.confirm(`Remove access for ${emailToRemove}?`);
    if (!ok) return;

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailToRemove }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? "Failed to remove.");

      setRows((cur) => cur.filter((r) => r.email !== emailToRemove));
    } catch (e: any) {
      setError(e?.message ?? "Failed to remove.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <div className="px-8 py-6 border-b">
          <div className="text-2xl font-bold">Admin</div>
          <div className="text-gray-600">Users & Roles</div>
        </div>
        <div className="p-8">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="flex items-center justify-between px-8 py-6 border-b">
        <div>
          <div className="text-3xl font-bold">Admin</div>
          <div className="text-gray-600">Manage who can access the app and their role.</div>
        </div>

        <div className="flex items-center gap-4">
          <Link className="underline" href="/app/teams">
            Teams
          </Link>
          <Link className="underline" href="/app/admin/users">
            Admin
          </Link>
        </div>
      </div>

      {error ? <div className="px-8 py-3 text-red-600">{error}</div> : null}

      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="border rounded-2xl p-6">
          <div className="text-xl font-semibold mb-2">Add / Update User Role</div>
          <div className="text-gray-600 mb-4">
            Roles: <b>viewer</b> = view only, <b>editor</b> = can edit boards, <b>admin</b> = can manage users.
          </div>

          <div className="flex flex-col gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <select
                className="w-full border rounded px-3 py-2 bg-white"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
              >
                <option value="viewer">viewer</option>
                <option value="editor">editor</option>
                <option value="admin">admin</option>
              </select>
            </div>

            <button
              className="rounded-md bg-black px-5 py-2 text-white disabled:opacity-60"
              disabled={saving}
              onClick={upsert}
            >
              {saving ? "Saving..." : "Save Role"}
            </button>

            <div className="text-xs text-gray-500">
              Tip: users still sign in via Supabase Auth — this list controls what they can do inside the app.
            </div>
          </div>
        </div>

        <div className="border rounded-2xl p-6">
          <div className="text-xl font-semibold mb-4">Current Users</div>

          {sorted.length === 0 ? (
            <div className="text-gray-600">No users found.</div>
          ) : (
            <div className="space-y-3">
              {sorted.map((r) => (
                <div key={r.email} className="border rounded-xl px-4 py-3 flex items-center justify-between">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.email}</div>
                    <div className="text-sm text-gray-600">Role: {r.role}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      className="border rounded px-2 py-1 bg-white text-sm"
                      value={r.role}
                      onChange={async (e) => {
                        const nextRole = e.target.value as UserRole;
                        setEmail(r.email);
                        setNewRole(nextRole);
                        await upsert();
                      }}
                      disabled={saving}
                      title="Change role"
                    >
                      <option value="viewer">viewer</option>
                      <option value="editor">editor</option>
                      <option value="admin">admin</option>
                    </select>

                    <button
                      type="button"
                      className="border px-3 py-1 rounded text-sm bg-white text-red-600 border-red-200 hover:bg-red-50"
                      onClick={() => remove(r.email)}
                      disabled={saving}
                      title="Remove user"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="text-xs text-gray-500 mt-4">
            Your role: <b>{role}</b>
          </div>
        </div>

        <div className="border rounded-2xl p-6">
          <div className="text-xl font-semibold mb-2">Other Admin Tools</div>
          <div className="flex items-center gap-4">
            <Link className="underline" href="/app/admin/requests">
              Access Requests
            </Link>
            <Link className="underline" href="/app/admin/invites">
              Invites
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
