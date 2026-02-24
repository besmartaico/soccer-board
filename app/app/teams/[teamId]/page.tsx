"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getMyRole } from "@/lib/roles";
import { normalizeGoogleRange } from "@/lib/googleRange";

type TeamRow = {
  id: string;
  name: string;
  data?: any;
  created_at: string;
};

type BoardRow = {
  id: string;
  team_id: string;
  name: string;
  data?: any;
  created_at: string;
};

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = String(params?.teamId || "");

  const [team, setTeam] = useState<TeamRow | null>(null);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newBoardName, setNewBoardName] = useState("");
  const [creatingBoard, setCreatingBoard] = useState(false);

  const roleLabel = useMemo(() => {
    return getMyRole()
      .then((r) => r)
      .catch(() => "none");
  }, []);

  // Google Sheet config (stored on team.data.google)
  const [sheetId, setSheetId] = useState("");
  const [range, setRange] = useState("");
  const [savingGoogle, setSavingGoogle] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoading(true);
      setError(null);

      const { data: userResp } = await supabase.auth.getUser();
      if (!userResp.user) {
        router.push("/login");
        return;
      }

      try {
        const teamResp = await supabase.from("teams").select("id,name,data,created_at").eq("id", teamId).single();
        if (teamResp.error) throw new Error(teamResp.error.message);

        const boardsResp = await supabase
          .from("boards")
          .select("id,team_id,name,data,created_at")
          .eq("team_id", teamId)
          .order("created_at", { ascending: false });

        if (boardsResp.error) throw new Error(boardsResp.error.message);

        if (!mounted) return;
        const t = teamResp.data as TeamRow;
        setTeam(t);
        setBoards((boardsResp.data ?? []) as BoardRow[]);

        const g = t?.data?.google;
        if (g?.sheetId) setSheetId(String(g.sheetId));
        if (g?.range) setRange(String(g.range));
      } catch (e: any) {
        if (!mounted) return;
        setError(e?.message ?? "Failed to load team.");
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    }

    if (teamId) load();
    return () => {
      mounted = false;
    };
  }, [router, teamId]);

  async function createBoard() {
    if (!teamId || !team) return;
    setCreatingBoard(true);
    setError(null);

    try {
      const name = newBoardName.trim();
      if (!name) throw new Error("Enter a board name.");

      // New boards should inherit roster config
      const g = team?.data?.google;
      const data = g?.sheetId && g?.range ? { google: g } : {};

      const { data: userResp } = await supabase.auth.getUser();
      const user = userResp.user;
      if (!user) throw new Error("You must be logged in.");

      const ins = await supabase
        .from("boards")
        .insert([{ team_id: teamId, name, data, created_by: user.id }])
        .select()
        .single();
      if (ins.error) throw new Error(ins.error.message);

      setNewBoardName("");
      setBoards((cur) => [ins.data as any, ...cur]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create board.");
    } finally {
      setCreatingBoard(false);
    }
  }

  async function deleteBoard(boardId: string, boardName: string) {
    const ok = window.confirm(`Delete board "${boardName}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    setError(null);

    try {
      const del = await supabase.from("boards").delete().eq("id", boardId);
      if (del.error) throw new Error(del.error.message);

      setBoards((cur) => cur.filter((b) => b.id !== boardId));
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete board.");
    }
  }

  async function saveGoogleConfig() {
    if (!teamId) return;

    setSavingGoogle(true);
    setError(null);

    try {
      const next = {
        ...(team?.data || {}),
        google: {
          sheetId: sheetId.trim(),
          range: normalizeGoogleRange(range.trim()),
        },
      };

      const u = await supabase.from("teams").update({ data: next }).eq("id", teamId);
      if (u.error) throw new Error(u.error.message);

      setTeam((cur) => (cur ? { ...cur, data: next } : cur));
    } catch (e: any) {
      setError(e?.message ?? "Failed to save Google Sheet config.");
    } finally {
      setSavingGoogle(false);
    }
  }

  if (loading) {
    return <div className="p-8 text-sm text-gray-500">Loading...</div>;
  }

  if (error) {
    // still show page chrome
  }

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold">{team?.name || "Team"}</h1>
          <div className="text-xs text-gray-500 mt-1">
            Invite-only team workspace • <Link className="underline" href="/teams">Back to Teams</Link>
          </div>
        </div>
      </div>

      {error ? <div className="text-red-600 text-sm mb-4">{error}</div> : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="border rounded-xl p-6">
          <h2 className="font-semibold mb-3">Boards</h2>

          <div className="flex gap-2 mb-4">
            <input
              className="border rounded-md px-3 py-2 flex-1"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              placeholder="New board name"
            />
            <button
              className="bg-black text-white rounded-md px-4 py-2 disabled:opacity-60"
              onClick={createBoard}
              disabled={creatingBoard}
            >
              {creatingBoard ? "Creating..." : "Create"}
            </button>
          </div>

          {boards.length === 0 ? <div className="text-sm text-gray-500">No boards yet.</div> : null}

          <div className="space-y-2">
            {boards.map((b) => (
              <div key={b.id} className="border rounded-lg p-3 flex items-center justify-between">
                <Link className="font-semibold hover:underline" href={`/boards/${b.id}`}>
                  {b.name}
                </Link>
                <button className="text-xs text-red-600 hover:underline" onClick={() => deleteBoard(b.id, b.name)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="border rounded-xl p-6">
          <h2 className="font-semibold mb-3">Roster Source (Google Sheet)</h2>
          <div className="text-xs text-gray-500 mb-4">
            Optional — used to load player roster onto boards.
          </div>

          <div className="space-y-3">
            <div>
              <div className="text-xs font-medium mb-1">Sheet ID</div>
              <input
                className="border rounded-md px-3 py-2 w-full"
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
                placeholder="Google Sheet ID"
              />
            </div>

            <div>
              <div className="text-xs font-medium mb-1">Range</div>
              <input
                className="border rounded-md px-3 py-2 w-full"
                value={range}
                onChange={(e) => setRange(e.target.value)}
                placeholder='e.g. "Roster!A1:K200"'
              />
              <div className="text-[11px] text-gray-500 mt-1">We normalize the range to a stable format.</div>
            </div>

            <button
              className="bg-black text-white rounded-md px-4 py-2 disabled:opacity-60"
              onClick={saveGoogleConfig}
              disabled={savingGoogle}
            >
              {savingGoogle ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}