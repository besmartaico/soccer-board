"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Team = {
  id: string;
  name: string;
};

type Board = {
  id: string;
  team_id: string;
  name: string;
  created_at: string;
};

export default function TeamBoardsPage() {
  const router = useRouter();
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;

  const [team, setTeam] = useState<Team | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardName, setBoardName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    // Require login
    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp.user) {
      router.push("/login");
      return;
    }

    // Load team
    const { data: teamData, error: teamErr } = await supabase
      .from("teams")
      .select("id,name")
      .eq("id", teamId)
      .single();

    if (teamErr) {
      setError(teamErr.message);
      setLoading(false);
      return;
    }

    setTeam(teamData as Team);

    // Load boards
    const { data: boardData, error: boardErr } = await supabase
      .from("boards")
      .select("id,team_id,name,created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (boardErr) setError(boardErr.message);
    setBoards((boardData as Board[]) ?? []);
    setLoading(false);
  }

  async function createBoard() {
    setError(null);
    const name = boardName.trim();
    if (!name) return;

    const { data: userResp } = await supabase.auth.getUser();
    const user = userResp.user;

    if (!user) {
      router.push("/login");
      return;
    }

    const { error: insErr } = await supabase.from("boards").insert([
      {
        team_id: teamId,
        name,
        data: {}, // will store canvases here
        created_by: user.id,
      },
    ]);

    if (insErr) {
      setError(insErr.message);
      return;
    }

    setBoardName("");
    await load();
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              {team ? team.name : "Team"}
            </h1>
            <p className="mt-2 text-sm text-gray-600">Boards</p>
          </div>

          <div className="flex items-center gap-4">
            <Link
              href="/app/teams"
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Teams
            </Link>
            <Link
              href="/"
              className="text-sm font-medium text-gray-700 hover:text-gray-900"
            >
              Home
            </Link>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Create a Board</h2>
          <p className="mt-1 text-sm text-gray-600">Example: Varsity Lineup vs Skyridge</p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              className="w-full flex-1 rounded-xl border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
              placeholder="Board name"
              value={boardName}
              onChange={(e) => setBoardName(e.target.value)}
            />
            <button
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800"
              onClick={createBoard}
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
          <div className="mb-3 text-sm font-semibold text-gray-700">Team Boards</div>

          {loading ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
              Loading...
            </div>
          ) : boards.length === 0 ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
              No boards yet. Create one above.
            </div>
          ) : (
            <div className="grid gap-3">
              {boards.map((b) => (
                <Link
                  key={b.id}
                  href={`/app/boards/${b.id}`}
                  className="group rounded-2xl border bg-white px-5 py-4 shadow-sm transition hover:border-gray-300 hover:shadow"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-base font-semibold text-gray-900">{b.name}</div>
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
