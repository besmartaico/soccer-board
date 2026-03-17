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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const role = await getMyRole();
    setIsAdmin(role === "admin");

    const { data: mem, error: memErr } = await supabase
      .from("team_members")
      .select("team_id")
      .eq("user_id", user.id);

    if (memErr) {
      setError(memErr.message);
      setLoading(false);
      return;
    }

    const teamIds = (mem?.data ?? []).map((r: any) => r.team_id).filter(Boolean);
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

      const ins = await supabase
        .from("teams")
        .insert([{ name, created_by: user.id }])
        .select()
        .single();

      if (ins.error) throw new Error(ins.error.message);

      const { data: sess } = await supabase.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Missing session token.");

      const api = await fetch("/api/teams/members", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ teamId: ins.data.id, userId: user.id, role: "admin" }),
      });

      if (!api.ok) {
        const err = await api.json();
        throw new Error(err.error ?? "Failed to add you to team.");
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

    await load();
  }

  return (
    <main className="min-h-screen bg-dark-900 text-dark-100">
      <div className="px-8 py-6 border-b border-dark-700">
        <div className="text-3xl font-bold text-dark-100">Teams</div>
        {isAdmin ? (
          <div className="text-sm text-dark-400 mt-1">Admin: use the Admin page to manage who can access the app.</div>
        ) : null}
      </div>

      {error ? <div className="px-8 py-3 text-red-400">{error}</div> : null}

      <div className="p-8 max-w-4xl mx-auto space-y-6">
        {isAdmin && (
          <div className="border border-dark-700 rounded-2xl p-6 bg-dark-800">
            <div className="text-xl font-semibold mb-3 text-dark-100">Create a Team</div>
            <div className="flex gap-3">
              <input
                className="flex-1 border border-dark-600 rounded px-3 py-2 bg-dark-700 text-dark-100 placeholder-dark-400 focus:outline-none focus:border-maroon-600"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Team name"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") createTeam();
                }}
              />
              <button
                className="rounded-md bg-maroon-800 px-5 py-2 text-white disabled:opacity-60 hover:bg-maroon-700 transition-colors"
                disabled={creating}
                onClick={createTeam}
              >
                {creating ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        )}

        <div className="border border-dark-700 rounded-2xl p-6 bg-dark-800">
          <div className="text-xl font-semibold mb-4 text-dark-100">Your Teams</div>
          {loading ? (
            <div className="text-dark-400">Loading...</div>
          ) : teams.length === 0 ? (
            <div className="text-dark-400">No teams yet.</div>
          ) : (
            <div className="space-y-2">
              {teams.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between border border-dark-600 rounded-xl px-4 py-3 bg-dark-700 hover:bg-dark-600 cursor-pointer transition-colors"
                  onClick={() => router.push(`/app/teams/${t.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") router.push(`/app/teams/${t.id}`);
                  }}
                  title="Open team"
                >
                  <div className="font-medium min-w-0 truncate text-dark-100">{t.name}</div>

                  {isAdmin && (
                    <button
                      type="button"
                      className="ml-3 inline-flex items-center justify-center w-7 h-7 rounded hover:bg-red-900 text-red-400 border border-red-800"
                      title="Delete team"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteTeam(t.id, t.name);
                      }}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
