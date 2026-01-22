"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);

    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp.user) {
      router.push("/login");
      return;
    }

    const res = await supabase.from("teams").select("id,name,created_at").order("created_at", { ascending: false });
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

    const ins = await supabase.from("teams").insert([{ name }]).select().single();
    if (ins.error) {
      setError(ins.error.message);
      setCreating(false);
      return;
    }

    setNewTeamName("");
    setTeams((cur) => [ins.data as any, ...cur]);
    setCreating(false);
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

    setTeams((cur) => cur.filter((t) => t.id !== teamId));
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="flex items-center justify-between px-8 py-6 border-b">
        <div>
          <div className="text-3xl font-bold">Teams</div>
          <div className="text-gray-600">Create a team or open an existing one.</div>
        </div>
        <Link className="underline" href="/">
          Home
        </Link>
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
            <div className="text-gray-600">No teams yet.</div>
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
