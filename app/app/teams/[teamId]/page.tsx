"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Team = {
  id: string;
  name: string;
  roster_sheet_id: string | null;
  roster_range: string | null;
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

  // Team roster settings
  const [sheetId, setSheetId] = useState("");
  const [range, setRange] = useState("");
  const [savingRoster, setSavingRoster] = useState(false);

  // Deleting state
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [deletingTeam, setDeletingTeam] = useState(false);

  const rosterConfigured = useMemo(() => {
    return !!(team?.roster_sheet_id && team?.roster_range);
  }, [team]);

  async function requireLogin() {
    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp.user) {
      router.push("/login");
      return null;
    }
    return userResp.user;
  }

  async function load() {
    setLoading(true);
    setError(null);

    const user = await requireLogin();
    if (!user) return;

    // Load team including roster fields
    const { data: teamData, error: teamErr } = await supabase
      .from("teams")
      .select("id,name,roster_sheet_id,roster_range")
      .eq("id", teamId)
      .single();

    if (teamErr) {
      setError(teamErr.message);
      setLoading(false);
      return;
    }

    const t = teamData as Team;
    setTeam(t);
    setSheetId(t.roster_sheet_id ?? "");
    setRange(t.roster_range ?? "");

    // Load boards
    const { data: boardData, error: boardErr } = await supabase
      .from("boards")
      .select("id,team_id,name,created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (boardErr) {
      setError(boardErr.message);
      setBoards([]);
      setLoading(false);
      return;
    }

    setBoards((boardData as Board[]) ?? []);
    setLoading(false);
  }

  async function saveRosterSettings() {
    setError(null);
    if (!teamId) return;

    const user = await requireLogin();
    if (!user) return;

    const nextSheet = sheetId.trim();
    const nextRange = range.trim();

    const oneSet = !!nextSheet || !!nextRange;
    if (oneSet && (!nextSheet || !nextRange)) {
      setError("Please provide both Sheet ID and Range (or clear both).");
      return;
    }

    setSavingRoster(true);
    try {
      const { error: upErr } = await supabase
        .from("teams")
        .update({
          roster_sheet_id: nextSheet || null,
          roster_range: nextRange || null,
        })
        .eq("id", teamId);

      if (upErr) throw new Error(upErr.message);

      setTeam((prev) =>
        prev
          ? { ...prev, roster_sheet_id: nextSheet || null, roster_range: nextRange || null }
          : prev
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to save roster settings.");
    } finally {
      setSavingRoster(false);
    }
  }

  async function createBoard() {
    setError(null);

    const name = boardName.trim();
    if (!name) return;

    const user = await requireLogin();
    if (!user) return;

    const tSheet = (team?.roster_sheet_id ?? "").trim();
    const tRange = (team?.roster_range ?? "").trim();

    const initialData: any = {
      htmlBoard: { placedPlayers: [], backgroundUrl: "" },
    };

    if (tSheet && tRange) {
      initialData.google = { sheetId: tSheet, range: tRange };
    }

    const { error: insErr } = await supabase.from("boards").insert([
      {
        team_id: teamId,
        name,
        data: initialData,
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

  async function deleteBoard(boardId: string, boardName: string) {
    setError(null);

    const ok = window.confirm(
      `Delete board "${boardName}"?\n\nThis cannot be undone.`
    );
    if (!ok) return;

    const user = await requireLogin();
    if (!user) return;

    setDeletingBoardId(boardId);
    try {
      const { error: delErr } = await supabase.from("boards").delete().eq("id", boardId);
      if (delErr) throw new Error(delErr.message);

      setBoards((prev) => prev.filter((b) => b.id !== boardId));
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete board.");
    } finally {
      setDeletingBoardId(null);
    }
  }

  async function deleteTeam(teamName: string) {
    setError(null);

    const ok = window.confirm(
      `Delete team "${teamName}"?\n\nThis will also delete ALL boards under the team.\nThis cannot be undone.`
    );
    if (!ok) return;

    const user = await requireLogin();
    if (!user) return;

    setDeletingTeam(true);
    try {
      // 1) delete boards for this team (avoids FK errors)
      const { error: delBoardsErr } = await supabase.from("boards").delete().eq("team_id", teamId);
      if (delBoardsErr) throw new Error(delBoardsErr.message);

      // 2) delete team
      const { error: delTeamErr } = await supabase.from("teams").delete().eq("id", teamId);
      if (delTeamErr) throw new Error(delTeamErr.message);

      router.push("/app/teams");
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete team.");
    } finally {
      setDeletingTeam(false);
    }
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
            <h1 className="text-3xl font-bold text-gray-900">{team ? team.name : "Team"}</h1>
            <p className="mt-2 text-sm text-gray-600">Boards</p>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/app/teams" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Teams
            </Link>
            <Link href="/" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Home
            </Link>
          </div>
        </div>

        {/* Danger zone: delete team */}
        {team ? (
          <div className="mt-6 rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-semibold text-red-700">Danger zone</div>
                <div className="text-xs text-gray-600 mt-1">
                  Deleting a team will also delete all boards in that team.
                </div>
              </div>

              <button
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                onClick={() => deleteTeam(team.name)}
                disabled={deletingTeam}
              >
                {deletingTeam ? "Deleting..." : "Delete team"}
              </button>
            </div>
          </div>
        ) : null}

        {/* Roster settings */}
        <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Team Roster (Google Sheets)</h2>
          <p className="mt-1 text-sm text-gray-600">
            Set this once per team. New boards will automatically load the roster.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs font-semibold text-gray-700 mb-1">Sheet ID</div>
              <input
                className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
                placeholder="Google Sheet ID"
                value={sheetId}
                onChange={(e) => setSheetId(e.target.value)}
              />
            </div>

            <div>
              <div className="text-xs font-semibold text-gray-700 mb-1">Range</div>
              <input
                className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
                placeholder='e.g. Player Detail!A:P'
                value={range}
                onChange={(e) => setRange(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
              onClick={saveRosterSettings}
              disabled={savingRoster}
            >
              {savingRoster ? "Saving..." : "Save roster settings"}
            </button>

            {rosterConfigured ? (
              <div className="text-sm text-green-700">Roster configured ✓</div>
            ) : (
              <div className="text-sm text-amber-700">Roster not configured yet</div>
            )}
          </div>
        </div>

        {/* Create board */}
        <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
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
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
              onClick={createBoard}
              disabled={!boardName.trim()}
            >
              Create
            </button>
          </div>

          {!rosterConfigured ? (
            <div className="mt-3 text-xs text-amber-700">
              Note: This team does not have a roster configured yet, so new boards will start with an empty roster.
            </div>
          ) : (
            <div className="mt-3 text-xs text-gray-500">
              New boards will automatically load the roster from Google Sheets.
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Boards list */}
        <div className="mt-8">
          <div className="mb-3 text-sm font-semibold text-gray-700">Team Boards</div>

          {loading ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">Loading...</div>
          ) : boards.length === 0 ? (
            <div className="rounded-2xl border bg-white p-6 text-sm text-gray-600">
              No boards yet. Create one above.
            </div>
          ) : (
            <div className="grid gap-3">
              {boards.map((b) => (
                <div
                  key={b.id}
                  className="rounded-2xl border bg-white px-5 py-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-4">
                    <Link
                      href={`/app/boards/${b.id}`}
                      className="min-w-0 flex-1"
                    >
                      <div className="text-base font-semibold text-gray-900 truncate">{b.name}</div>
                    </Link>

                    <div className="flex items-center gap-3">
                      <Link
                        href={`/app/boards/${b.id}`}
                        className="text-sm text-gray-600 hover:text-gray-900 underline"
                      >
                        Open →
                      </Link>

                      <button
                        className="text-sm text-red-600 hover:text-red-700 underline disabled:opacity-60"
                        onClick={() => deleteBoard(b.id, b.name)}
                        disabled={deletingBoardId === b.id}
                      >
                        {deletingBoardId === b.id ? "Deleting..." : "Delete"}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
