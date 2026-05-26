"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getMyRole } from "@/lib/roles";

type TeamRow = {
  id: string;
  name: string;
  data: any;
  created_at: string;
};

type BoardRow = {
  id: string;
  team_id: string;
  name: string;
  data: any;
  created_at: string;
};

function extractSheetId(input: string): string {
  const s = (input || "").trim();
  const m = s.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1];
  return s;
}

export default function TeamPage() {
  const { teamId } = useParams() as { teamId: string };
  const router = useRouter();

  const [team, setTeam] = useState<TeamRow | null>(null);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberRole, setMemberRole] = useState<string | null>(null);

  // Roster fields
  const [sheetLink, setSheetLink] = useState("");
  const [detectedSheetId, setDetectedSheetId] = useState("");
  const [sheetTab, setSheetTab] = useState("");
  const [startCol, setStartCol] = useState("");
  const [endCol, setEndCol] = useState("");
  const [savingRoster, setSavingRoster] = useState(false);

  // New board
  const [newBoardName, setNewBoardName] = useState("");
  const [creatingBoard, setCreatingBoard] = useState(false);

  // Share team
  const [shareEmail, setShareEmail] = useState("");
  const [shareRole, setShareRole] = useState("viewer");
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);

  const computedRange = useMemo(() => {
    if (!sheetTab || !startCol || !endCol) return "";
    return `${sheetTab}!${startCol}:${endCol}`;
  }, [sheetTab, startCol, endCol]);

  async function load() {
    setLoading(true);
    setError(null);

    if (!teamId) {
      setError("Missing team id.");
      setLoading(false);
      return;
    }

    const { data: userResp } = await supabase.auth.getUser();
    if (!userResp.user) {
      router.push("/login");
      return;
    }

    const mem = await supabase
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", userResp.user.id)
      .maybeSingle();

    if (mem.error) {
      setError(mem.error.message);
      setLoading(false);
      return;
    }

    if (!mem.data) {
      setError("You don't have access to this team.");
      setLoading(false);
      return;
    }

    setMemberRole(mem.data.role);

    const teamRes = await supabase
      .from("teams")
      .select("id,name,data,created_at")
      .eq("id", teamId)
      .single();

    if (teamRes.error) {
      setError(teamRes.error.message);
      setLoading(false);
      return;
    }

    setTeam(teamRes.data as TeamRow);

    const google = teamRes.data?.data?.google ?? {};
    setSheetLink(google.sheetId ?? "");
    setSheetTab(google.range?.split("!")?.[0] ?? "");
    const cols = google.range?.split("!")?.[1]?.split(":") ?? [];
    setStartCol(cols[0] ?? "");
    setEndCol(cols[1] ?? "");

    const boardsRes = await supabase
      .from("boards")
      .select("id,team_id,name,data,created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (boardsRes.error) {
      setError(boardsRes.error.message);
      setLoading(false);
      return;
    }

    setBoards((boardsRes.data ?? []) as BoardRow[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  async function saveRoster() {
    if (!teamId || !team) return;
    setSavingRoster(true);
    setError(null);

    try {
      const sheetId = detectedSheetId || sheetLink.trim();
      if (!sheetId) throw new Error("Please enter a Google Sheet ID.");
      if (!computedRange) throw new Error("Please fill sheet tab name + start/end columns.");

      const prev = team.data && typeof team.data === "object" ? team.data : {};
      const nextData = {
        ...prev,
        google: {
          sheetId,
          range: computedRange,
        },
      };

      const u = await supabase.from("teams").update({ data: nextData }).eq("id", teamId);
      if (u.error) throw new Error(u.error.message);

      setTeam((t) => t ? { ...t, data: nextData } : t);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save roster.");
    } finally {
      setSavingRoster(false);
    }
  }

  async function createBoard() {
    const name = newBoardName.trim();
    if (!name || !teamId) return;
    setCreatingBoard(true);
    setError(null);

    try {
            const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not authenticated.");

      const res = await fetch("/api/boards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ teamId, name }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to create board.");
      }

      const { board } = await res.json();
      setNewBoardName("");
      setBoards((cur) => [board, ...cur]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create board.");
    } finally {
      setCreatingBoard(false);
    }
  }

  async function duplicateBoard(board: BoardRow) {
    if (!teamId) return;
    setError(null);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not authenticated.");

      const res = await fetch("/api/boards", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ teamId, name: `${board.name} (copy)`, data: board.data }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to duplicate board.");
      }

      const { board: newBoard } = await res.json();
      setBoards((cur) => [newBoard, ...cur]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to duplicate board.");
    }
  }

  async function deleteBoard(boardId: string, boardName: string) {
    const ok = window.confirm(`Delete board "${boardName}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    setError(null);
    const del = await supabase.from("boards").delete().eq("id", boardId);
    if (del.error) {
      setError(del.error.message);
      return;
    }
    setBoards((cur) => cur.filter((b) => b.id !== boardId));
  }

  async function shareTeam() {
    if (!shareEmail.trim() || !teamId) return;
    setSharing(true);
    setShareMsg(null);
    setError(null);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      if (!token) throw new Error("Not authenticated.");

      const res = await fetch("/api/teams/share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ teamId, email: shareEmail.trim(), role: shareRole }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Failed to share team.");
      }

      setShareMsg(`Team shared with ${shareEmail.trim()} as ${shareRole}.`);
      setShareEmail("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to share team.");
    } finally {
      setSharing(false);
    }
  }

  const canCreateBoards = memberRole === "admin" || memberRole === "editor";
  const canEdit = memberRole === "admin" || memberRole === "editor";

  if (loading) return <main className="min-h-screen bg-dark-900 text-dark-100 p-8">Loading...</main>;
  if (!team) return <main className="min-h-screen bg-dark-900 text-dark-100 p-8">Team not found.</main>;

  return (
    <main className="min-h-screen bg-dark-900 text-dark-100">
      <div className="px-8 py-6 border-b border-dark-700 flex items-center justify-between">
        <div>
          <div className="text-3xl font-bold text-dark-100 truncate">{team?.name || "Team"}</div>
          <div className="text-dark-400 text-sm">Boards{memberRole ? ` · Your access: ${memberRole}` : ""}</div>
        </div>
        {memberRole === "admin" && teamId && (
          <button
            onClick={() => router.push(`/app/teams/${teamId}/settings/card-template`)}
            className="px-3 py-2 rounded border border-dark-700 text-dark-100 text-sm hover:bg-dark-800"
          >
            ⚙ Card Template
          </button>
        )}
      </div>

      {error ? <div className="px-8 py-3 text-red-400">{error}</div> : null}

      <div className="p-8 max-w-4xl mx-auto space-y-6">

        {/* ── Create a Board ── */}
        <div className="border border-dark-700 rounded-2xl p-6 bg-dark-800">
          <div className="font-semibold mb-1 text-dark-100">Create a Board</div>
          <div className="flex gap-3">
            <input
              className="flex-1 border border-dark-600 rounded px-3 py-2 bg-dark-700 text-dark-100 placeholder-dark-400 focus:outline-none focus:border-maroon-600"
              value={newBoardName}
              onChange={(e) => setNewBoardName(e.target.value)}
              placeholder="Board name"
            />
            <button
              className="rounded-md bg-maroon-800 px-5 py-2 text-white disabled:opacity-60 hover:bg-maroon-700 transition-colors"
              disabled={creatingBoard || !canCreateBoards}
              onClick={createBoard}
              title={!canCreateBoards ? "You need editor or admin access to create boards." : ""}
            >
              {creatingBoard ? "Creating..." : "Create"}
            </button>
          </div>
          <div className="text-dark-400 text-sm mt-2">New boards will automatically load the roster.</div>
          {!canCreateBoards ? (
            <div className="text-sm text-dark-500 mt-2">You currently have viewer access.</div>
          ) : null}
        </div>

        {/* ── Boards list ── */}
        <div className="border border-dark-700 rounded-2xl p-6 bg-dark-800">
          <div className="font-semibold mb-4 text-dark-100">Boards</div>
          {boards.length === 0 ? (
            <div className="text-dark-400">No boards yet.</div>
          ) : (
            <div className="space-y-2">
              {boards.map((b) => (
                <div
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  className="border border-dark-600 rounded-xl px-4 py-3 flex items-center justify-between bg-dark-700 hover:bg-dark-600 cursor-pointer transition-colors"
                  onClick={() => router.push(`/app/boards/${b.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") router.push(`/app/boards/${b.id}`);
                  }}
                  title="Open board"
                >
                  <div className="font-medium min-w-0 truncate text-dark-100">{b.name}</div>
                  <div className="flex items-center gap-2 ml-3 shrink-0">
                    {canEdit && (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center px-2 py-1 rounded text-xs bg-dark-600 hover:bg-dark-500 text-dark-200 border border-dark-500 transition-colors"
                        title="Duplicate board"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          duplicateBoard(b);
                        }}
                      >
                        ⧉ Copy
                      </button>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        className="inline-flex items-center justify-center w-7 h-7 rounded hover:bg-red-900 text-red-400 border border-red-800 transition-colors"
                        title="Delete board"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          deleteBoard(b.id, b.name);
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Roster ── */}
        {canEdit && (
          <div className="border border-dark-700 rounded-2xl p-6 bg-dark-800">
            <div className="font-semibold mb-3 text-dark-100">Roster</div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1 text-dark-300">Google Sheet ID</label>
                <input
                  className="w-full border border-dark-600 rounded px-3 py-2 bg-dark-700 text-dark-100 placeholder-dark-400 focus:outline-none focus:border-maroon-600"
                  value={sheetLink}
                  onChange={(e) => {
                    setSheetLink(e.target.value);
                    setDetectedSheetId(extractSheetId(e.target.value));
                  }}
                  placeholder="Sheet ID or full URL"
                />
                {detectedSheetId && detectedSheetId !== sheetLink.trim() && (
                  <div className="text-xs text-dark-400 mt-1">Detected ID: <span className="font-mono text-dark-200">{detectedSheetId}</span></div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1 text-dark-300">Sheet tab name</label>
                  <input
                    className="w-full border border-dark-600 rounded px-3 py-2 bg-dark-700 text-dark-100 placeholder-dark-400 focus:outline-none focus:border-maroon-600"
                    value={sheetTab}
                    onChange={(e) => setSheetTab(e.target.value)}
                    placeholder="Player Detail"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-dark-300">Start column</label>
                  <input
                    className="w-full border border-dark-600 rounded px-3 py-2 bg-dark-700 text-dark-100 placeholder-dark-400 focus:outline-none focus:border-maroon-600"
                    value={startCol}
                    onChange={(e) => setStartCol(e.target.value)}
                    placeholder="A"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1 text-dark-300">End column</label>
                  <input
                    className="w-full border border-dark-600 rounded px-3 py-2 bg-dark-700 text-dark-100 placeholder-dark-400 focus:outline-none focus:border-maroon-600"
                    value={endCol}
                    onChange={(e) => setEndCol(e.target.value)}
                    placeholder="Z"
                  />
                </div>
              </div>

              <div className="text-sm text-dark-400 mt-3">
                Range: <span className="font-mono text-dark-200">{computedRange || "(fill fields above)"}</span>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  className="rounded-md bg-maroon-800 px-5 py-2 text-white disabled:opacity-60 hover:bg-maroon-700 transition-colors"
                  disabled={savingRoster}
                  onClick={saveRoster}
                >
                  {savingRoster ? "Saving..." : "Save roster"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Share Team ── */}
        {canEdit && (
          <div className="border border-dark-700 rounded-2xl p-6 bg-dark-800">
            <div className="font-semibold mb-3 text-dark-100">Share Team</div>
            <p className="text-sm text-dark-400 mb-3">Share this team (and its roster) with another user. They will see the team and boards you choose to share with them.</p>
            <div className="flex gap-3 flex-wrap">
              <input
                className="flex-1 min-w-0 border border-dark-600 rounded px-3 py-2 bg-dark-700 text-dark-100 placeholder-dark-400 focus:outline-none focus:border-maroon-600"
                value={shareEmail}
                onChange={(e) => setShareEmail(e.target.value)}
                placeholder="Email address"
                type="email"
              />
              <select
                className="border border-dark-600 rounded px-3 py-2 bg-dark-700 text-dark-100 focus:outline-none focus:border-maroon-600"
                value={shareRole}
                onChange={(e) => setShareRole(e.target.value)}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
              <button
                className="rounded-md bg-maroon-800 px-5 py-2 text-white disabled:opacity-60 hover:bg-maroon-700 transition-colors"
                disabled={sharing || !shareEmail.trim()}
                onClick={shareTeam}
              >
                {sharing ? "Sharing..." : "Share"}
              </button>
            </div>
            {shareMsg && <div className="text-sm text-green-400 mt-2">{shareMsg}</div>}
          </div>
        )}

      </div>
    </main>
  );
}
