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
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Teams</h1>
            {email && (
              <p className="mt-2 text-sm text-gray-600">
                Logged in as <span className="font-medium text-gray-900">{email}</span>
              </p>
            )}
          </div>

          <Link
            href="/"
            className="text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Home
          </Link>
        </div>

        <div className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Create a Team</h2>
          <p className="mt-1 text-sm text-gray-600">Example: Lone Peak Boys Soccer</p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              className="w-full flex-1 rounded-xl border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
              placeholder="Team name"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
            />
            <button
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
              onClick={createTeam}
            >
              Create
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-8">
          <div className="mb-3 text-sm font-semibold text-gray-700">Your Teams</div>

          {loading ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
              Loading...
            </div>
          ) : teams.length === 0 ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
              No teams yet. Create one above.
            </div>
          ) : (
            <div className="grid gap-3">
              {teams.map((t) => (
                <Link
                  key={t.id}
                  href={`/app/teams/${t.id}`}
                  className="group rounded-2xl border bg-white px-5 py-4 shadow-sm transition hover:border-gray-300 hover:shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-base font-semibold text-gray-900">{t.name}</div>
                    <div className="text-sm text-gray-500 group-hover:text-gray-700">
                      Open →
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
