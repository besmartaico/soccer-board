"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Team = {
  id: string;
  name: string;
  created_at: string;
  created_by: string;
};

export default function TeamsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    const { data: userResp } = await supabase.auth.getUser();
    const user = userResp.user;

    if (!user) {
      router.push("/login");
      return;
    }

    setEmail(user.email ?? null);

    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) setError(error.message);
    setTeams((data as Team[]) ?? []);
    setLoading(false);
  }

  async function createTeam() {
    setError(null);
    const name = teamName.trim();
    if (!name) return;

    const { data: userResp } = await supabase.auth.getUser();
    const user = userResp.user;

    if (!user) {
      router.push("/login");
      return;
    }

    // 1) Create team
    const { data: team, error: teamErr } = await supabase
      .from("teams")
      .insert([{ name, created_by: user.id }])
      .select()
      .single();

    if (teamErr) {
      setError(teamErr.message);
      return;
    }

    // 2) Add creator as team member (owner)
    const { error: memErr } = await supabase.from("team_members").insert([
      { team_id: (team as any).id, user_id: user.id, role: "owner" },
    ]);

    if (memErr) {
      setError(memErr.message);
      return;
    }

    setTeamName("");
    await load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="max-w-2xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Teams</h1>
        <Link className="underline" href="/">
          Home
        </Link>
      </div>

      {email && (
        <p className="text-sm text-gray-600 mb-4">
          Logged in as <b>{email}</b>
        </p>
      )}

      <div className="border rounded p-4 mb-6">
        <h2 className="font-semibold mb-2">Create a Team</h2>
        <div className="flex gap-2">
          <input
            className="border p-2 flex-1"
            placeholder="e.g., Lone Peak Boys Soccer"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
          />
          <button
            className="bg-black text-white px-4 py-2 rounded"
            onClick={createTeam}
          >
            Create
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p>Loading...</p>
      ) : teams.length === 0 ? (
        <p>No teams yet. Create one above.</p>
      ) : (
        <div className="space-y-3">
          {teams.map((t) => (
            <Link
              key={t.id}
              href={`/app/teams/${t.id}`}
              className="block border rounded p-4 hover:bg-gray-50"
            >
              <div className="font-semibold">{t.name}</div>
              <div className="text-xs text-gray-600">{t.id}</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
