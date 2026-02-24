"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getMyRole } from "@/lib/roles";

type TeamRow = {
  id: string;
  name: string;
  created_at: string;
};

export default function TeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);

    const { data: userResp } = await supabase.auth.getUser();
    const user = userResp.user;
    if (!user) {
      router.push("/login");
      return;
    }

    const role = await getMyRole();
    setIsAdmin(role === "admin");

    // Invite-only teams:
    // Only show teams where the user has a row in public.team_members
    const mem = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id);

    if (mem.error) {
      setError(mem.error.message);
      setLoading(false);
      return;
    }

    const teamIds = (mem.data ?? []).map((r: any) => r.team_id).filter(Boolean);
    if (teamIds.length === 0) {
      setTeams([]);
      setLoading(false);
      return;
    }

    const res = await supabase
      .from("teams")
      .select("id,name,created_at")
      .in("id", teamIds)
      .order("created_at", { ascending: false });

    if (res.error) {
      setError(res.error.message);
      setLoading(false);
      return;
    }

    setTeams((res.data ?? []) as TeamRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createTeam() {
    const name = newTeamName.trim();
    if (!name) return;

    setCreating(true);
    setError(null);

    try {
      const { data: userResp } = await supabase.auth.getUser();
      const user = userResp.user;
      if (!user) throw new Error("You must be logged in.");

      // teams.created_by is NOT NULL in the DB, so we must set it.
      const ins = await supabase
        .from("teams")
        .insert([{ name, created_by: user.id }])
        .select()
        .single();
      if (ins.error) throw new Error(ins.error.message);

      // Ensure the creator can see the team (add membership row for themselves)
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Missing session token.");

      const api = await fetch("/api/teams/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ teamId: ins.data.id, role: "admin" }),
      });
      const apiJson = await api.json();
      if (!api.ok || !apiJson?.success) {
        throw new Error(apiJson?.error ?? "Failed to create membership.");
      }

      setNewTeamName("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create team.");
    } finally {
      setCreating(false);
    }
  }

  async function deleteTeam(teamId: string, teamName: string) {
    const ok = window.confirm(
      `Delete team "${teamName}"?\n\nThis will also delete ALL boards under it (if your DB has cascade). This cannot be undone.`
    );
    if (!ok) return;

    setError(null);

    // If you don't have cascade deletes, you must delete boards first:
    const delBoards = await supabase.from("boards").delete().eq("team_id", teamId);
    if (delBoards.error) {
      setError(delBoards.error.message);
      return;
    }

    const delTeam = await supabase.from("teams").delete().eq("id", teamId);
    if (delTeam.error) {
      setError(delTeam.error.message);
      return;
    }

    // Also remove membership rows (safe even if cascade exists)
    await supabase.from("team_members").delete().eq("team_id", teamId);

    setTeams((cur) => cur.filter((t) => t.id !== teamId));
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="px-8 py-6 border-b">
        <div className="text-3xl font-bold">Teams</div>
        <div className="text-gray-600">Invite-only: you only see teams you’ve been added to.</div>
        {isAdmin ? (
          <div className="text-sm text-gray-600 mt-1">Admin: use the Admin page to manage who can access the app.</div>
        ) : null}
      </div>

      {error ? <div className="px-8 py-3 text-red-600">{error}</div> : null}

      <div className="p-8 max-w-4xl mx-auto space-y-6">
        <div className="border rounded-2xl p-6">
          <div className="text-xl font-semibold mb-3">Create a Team</div>
          <div className="flex gap-3">
            <input
              className="flex-1 border rounded px-3 py-2"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Team name (ex: Lone Peak Tryout)"
            />
            <button
              className="rounded-md bg-black px-5 py-2 text-white disabled:opacity-60"
              disabled={creating}
              onClick={createTeam}
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>

        <div className="border rounded-2xl p-6">
          <div className="text-xl font-semibold mb-3">Your Teams</div>

          {loading ? (
            <div>Loading...</div>
          ) : teams.length === 0 ? (
            <div className="text-gray-600">No teams yet (or you haven’t been invited).</div>
          ) : (
            <div className="space-y-3">
              {teams.map((t) => (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  className="border rounded-xl px-4 py-3 flex items-center justify-between hover:bg-gray-50 cursor-pointer"
                  onClick={() => router.push(`/app/teams/${t.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") router.push(`/app/teams/${t.id}`);
                  }}
                  title="Open team"
                >
                  <div className="font-medium min-w-0 truncate">{t.name}</div>

                  <button
                    type="button"
                    className="ml-3 inline-flex items-center justify-center w-7 h-7 rounded hover:bg-red-50 text-red-600 border border-red-200"
                    title="Delete team"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteTeam(t.id, t.name);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
