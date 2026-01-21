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

function extractSheetIdFromUrl(input: string): string {
  const s = (input ?? "").trim();
  if (!s) return "";

  // If they already pasted a raw ID, allow it
  if (/^[a-zA-Z0-9-_]{20,}$/.test(s) && !s.includes("/")) return s;

  try {
    const u = new URL(s);

    // Typical: https://docs.google.com/spreadsheets/d/<ID>/edit
    const m = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (m && m[1]) return m[1];

    // Sometimes: ?id=<ID>
    const idParam = u.searchParams.get("id");
    if (idParam) return idParam;

    return "";
  } catch {
    // Not a URL, maybe they pasted the ID
    if (/^[a-zA-Z0-9-_]{20,}$/.test(s)) return s;
    return "";
  }
}

function normalizeColumn(col: string): string {
  const c = (col ?? "").trim().toUpperCase();
  if (!c) return "";
  if (!/^[A-Z]{1,3}$/.test(c)) return "";
  return c;
}

function parseRosterRange(range: string | null): { sheetName: string; startCol: string; endCol: string } {
  const r = (range ?? "").trim();
  if (!r) return { sheetName: "", startCol: "", endCol: "" };

  const parts = r.split("!");
  if (parts.length !== 2) return { sheetName: "", startCol: "", endCol: "" };

  const sheetName = parts[0];
  const cols = parts[1].split(":");
  if (cols.length !== 2) return { sheetName, startCol: "", endCol: "" };

  return {
    sheetName,
    startCol: (cols[0] ?? "").toUpperCase(),
    endCol: (cols[1] ?? "").toUpperCase(),
  };
}

export default function TeamBoardsPage() {
  const router = useRouter();
  const params = useParams<{ teamId: string }>();
  const teamId = params.teamId;

  const [team, setTeam] = useState<Team | null>(null);
  const [boards, setBoards] = useState<Board[]>([]);
  const [boardName, setBoardName] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Roster inputs (non-technical)
  const [sheetLink, setSheetLink] = useState("");
  const [sheetIdPreview, setSheetIdPreview] = useState("");
  const [tabName, setTabName] = useState("");
  const [startCol, setStartCol] = useState("");
  const [endCol, setEndCol] = useState("");
  const [savingRoster, setSavingRoster] = useState(false);

  // Deleting state
  const [deletingBoardId, setDeletingBoardId] = useState<string | null>(null);
  const [deletingTeam, setDeletingTeam] = useState(false);

  const rosterConfigured = useMemo(() => {
    return !!(team?.roster_sheet_id && team?.roster_range);
  }, [team]);

  const computedSheetId = useMemo(() => extractSheetIdFromUrl(sheetLink), [sheetLink]);

  const computedRange = useMemo(() => {
    const tn = (tabName ?? "").trim();
    const sc = normalizeColumn(startCol);
    const ec = normalizeColumn(endCol);
    if (!tn || !sc || !ec) return "";
    return `${tn}!${sc}:${ec}`;
  }, [tabName, startCol, endCol]);

  useEffect(() => {
    setSheetIdPreview(computedSheetId);
  }, [computedSheetId]);

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

    const parsed = parseRosterRange(t.roster_range);
    setTabName(parsed.sheetName || "");
    setStartCol(parsed.startCol || "");
    setEndCol(parsed.endCol || "");

    // We store ID, not URL (unless user pasted URL again)
    setSheetLink(t.roster_sheet_id ?? "");
    setSheetIdPreview(t.roster_sheet_id ?? "");

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

    const user = await requireLogin();
    if (!user) return;

    const id = extractSheetIdFromUrl(sheetLink);
    const tn = (tabName ?? "").trim();
    const sc = normalizeColumn(startCol);
    const ec = normalizeColumn(endCol);

    const anySet = !!(sheetLink.trim() || tn || sc || ec);
    if (anySet) {
      if (!id) {
        setError("Please paste a valid Google Sheets link (or the Sheet ID).");
        return;
      }
      if (!tn) {
        setError("Please enter the Sheet tab name (example: Player Detail).");
        return;
      }
      if (!sc || !ec) {
        setError("Please enter a valid Start Column and End Column (example: A to P).");
        return;
      }
    }

    const nextSheetId = id || null;
    const nextRange = anySet ? `${tn}!${sc}:${ec}` : null;

    setSavingRoster(true);
    try {
      const { error: upErr } = await supabase
        .from("teams")
        .update({
          roster_sheet_id: nextSheetId,
          roster_range: nextRange,
        })
        .eq("id", teamId);

      if (upErr) throw new Error(upErr.message);

      setTeam((prev) =>
        prev ? { ...prev, roster_sheet_id: nextSheetId, roster_range: nextRange } : prev
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to save roster.");
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

    const ok = window.confirm(`Delete board "${boardName}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    const user = await requireLogin();
    if (!user) return;

    setDeletingBoardId(boardId);
    try {
      const { error: delErr } = await supabase.from("boards").delete().eq("id", boardId);
      if (delErr) throw new Error(delErr.message);
      setBoards((prev) => prev.filter((x) => x.id !== boardId));
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
      const { error: delBoardsErr } = await supabase.from("boards").delete().eq("team_id", teamId);
      if (delBoardsErr) throw new Error(delBoardsErr.message);

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

  const rosterHelp = useMemo(() => {
    if (!sheetLink.trim()) return "";
    if (!computedSheetId) return "Couldn’t detect a Sheet ID from that link.";
    return `Detected Sheet ID: ${computedSheetId}`;
  }, [sheetLink, computedSheetId]);

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

        {/* Combined: Roster + Create Board */}
        <div className="mt-8 rounded-2xl border bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Roster + Create a Board</h2>
              <p className="mt-1 text-sm text-gray-600">
                Set the roster once per team. New boards will automatically load the roster.
              </p>
            </div>

            {/* Roster settings */}
            <div className="rounded-xl border bg-gray-50 p-4">
              <div className="text-sm font-semibold text-gray-900">Team Roster (Google Sheets)</div>

              <div className="mt-3 grid gap-3">
                <div>
                  <div className="text-xs font-semibold text-gray-700 mb-1">Google Sheet link</div>
                  <input
                    className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
                    placeholder="Paste the full Google Sheets link here"
                    value={sheetLink}
                    onChange={(e) => setSheetLink(e.target.value)}
                  />
                  {sheetLink.trim() ? (
                    <div className={`mt-1 text-xs ${computedSheetId ? "text-gray-600" : "text-red-600"}`}>
                      {rosterHelp}
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-gray-500">
                      Example: https://docs.google.com/spreadsheets/d/XXXXXXXXXXXX/edit
                    </div>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-1">Sheet tab name</div>
                    <input
                      className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
                      placeholder="Player Detail"
                      value={tabName}
                      onChange={(e) => setTabName(e.target.value)}
                    />
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-1">Start column</div>
                    <input
                      className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
                      placeholder="A"
                      value={startCol}
                      onChange={(e) => setStartCol(e.target.value)}
                    />
                  </div>

                  <div>
                    <div className="text-xs font-semibold text-gray-700 mb-1">End column</div>
                    <input
                      className="w-full rounded-xl border px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-gray-900/10"
                      placeholder="P"
                      value={endCol}
                      onChange={(e) => setEndCol(e.target.value)}
                    />
                  </div>
                </div>

                <div className="text-xs text-gray-600">
                  {computedRange ? (
                    <>
                      We’ll use this range: <code>{computedRange}</code>
                    </>
                  ) : (
                    <>Enter tab name + start/end columns to build the range automatically.</>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-800 disabled:opacity-60"
                    onClick={saveRosterSettings}
                    disabled={savingRoster}
                  >
                    {savingRoster ? "Saving..." : "Save roster"}
                  </button>

                  {rosterConfigured ? (
                    <div className="text-sm text-green-700">Roster configured ✓</div>
                  ) : (
                    <div className="text-sm text-amber-700">Roster not configured yet</div>
                  )}
                </div>

                {/* Show what is stored */}
                {team?.roster_sheet_id || team?.roster_range ? (
                  <div className="text-xs text-gray-500">
                    Saved: <code>{team.roster_sheet_id ?? ""}</code>{" "}
                    {team.roster_range ? (
                      <>
                        {" "}
                        / <code>{team.roster_range}</code>
                      </>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Create board */}
            <div className="rounded-xl border p-4">
              <div className="text-sm font-semibold text-gray-900">Create a Board</div>
              <p className="mt-1 text-xs text-gray-600">Example: Varsity Lineup vs Skyridge</p>

              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
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
                  Note: roster isn’t configured yet, so new boards will start with an empty roster.
                </div>
              ) : (
                <div className="mt-3 text-xs text-gray-500">New boards will automatically load the roster.</div>
              )}
            </div>
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
                <div key={b.id} className="rounded-2xl border bg-white px-5 py-4 shadow-sm">
                  <div className="flex items-center justify-between gap-4">
                    <Link href={`/app/boards/${b.id}`} className="min-w-0 flex-1">
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

        {/* Helpful debug (can remove later) */}
        <div className="mt-8 text-xs text-gray-400">
          Sheet ID preview: {sheetIdPreview || "(none)"}
        </div>
      </div>
    </main>
  );
}
