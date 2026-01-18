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
    <main className="max-w-3xl mx-auto p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{team ? team.name : "Team"}</h1>
          <p className="text-sm text-gray-600">Boards</p>
        </div>

        <div className="flex gap-4">
          <Link href="/app/teams" className="underline">
            Teams
          </Link>
          <Link href="/" className="underline">
            Home
          </Link>
        </div>
      </div>

      <div className="border rounded p-4 mb-6">
        <h2 className="font-semibold mb-2">Create a Board</h2>
        <div className="flex gap-2">
          <input
            className="border p-2 flex-1"
            placeholder="e.g., Varsity Lineup vs Skyridge"
            value={boardName}
            onChange={(e) => setBoardName(e.target.value)}
          />
          <button
            className="bg-black text-white px-4 py-2 rounded"
            onClick={createBoard}
          >
            Create
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 mb-4">{error}</p>}

      {loading ? (
        <p>Loading...</p>
      ) : boards.length === 0 ? (
        <p>No boards yet. Create one above.</p>
      ) : (
        <div className="space-y-3">
          {boards.map((b) => (
            <Link
              key={b.id}
              href={`/app/boards/${b.id}`}
              className="block border rounded p-4 hover:bg-gray-50"
            >
              <div className="font-semibold">{b.name}</div>
              <div className="text-xs text-gray-600">{b.id}</div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
