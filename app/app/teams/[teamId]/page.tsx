"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

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

function extractSheetId(input: string) {
  const s = (input || "").trim();
  if (!s) return "";
  // allow pasting raw ID
  if (/^[a-zA-Z0-9-_]{20,}$/.test(s) && !s.includes("/") && !s.includes("?")) return s;

  try {
    const u = new URL(s);
    // .../spreadsheets/d/<ID>/...
    const m = u.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
    if (m && m[1]) return m[1];
    // ?id=<ID>
    const id = u.searchParams.get("id");
    if (id) return id;
  } catch {
    // ignore
  }
  return "";
}

function buildRange(tab: string, startCol: string, endCol: string) {
  const t = (tab || "").trim();
  const a = (startCol || "").trim().toUpperCase();
  const b = (endCol || "").trim().toUpperCase();
  if (!t || !a || !b) return "";
  return `${t}!${a}:${b}`;
}

export default function TeamBoardsPage() {
  const router = useRouter();
  const params = useParams();
  const raw = (params as any)?.teamId;
  const teamId: string | null =
    typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : null;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [team, setTeam] = useState<TeamRow | null>(null);
  const [boards, setBoards] = useState<BoardRow[]>([]);

  // roster inputs (friendly)
  const [sheetLink, setSheetLink] = useState("");
  const [sheetTab, setSheetTab] = useState("Player Detail");
  const [startCol, setStartCol] = useState("A");
  const [endCol, setEndCol] = useState("P");
  const detectedSheetId = useMemo(() => extractSheetId(sheetLink), [sheetLink]);
  const computedRange = useMemo(() => buildRange(sheetTab, startCol, endCol), [sheetTab, startCol, endCol]);

  // create board
  const [newBoardName, setNewBoardName] = useState("");
  const [savingRoster, setSavingRoster] = useState(false);
  const [creatingBoard, setCreatingBoard] = useState(false);

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

    const t = await supabase.from("teams").select("id,name,data,created_at").eq("id", teamId).single();
    if (t.error) {
      setError(t.error.message);
      setLoading(false);
      return;
    }
    const teamRow = t.data as TeamRow;
    setTeam(teamRow);

    const b = await supabase
      .from("boards")
      .select("id,team_id,name,data,created_at")
      .eq("team_id", teamId)
      .order("created_at", { ascending: false });

    if (b.error) {
      setError(b.error.message);
      setLoading(false);
      return;
    }
    setBoards((b.data ?? []) as BoardRow[]);

    // hydrate roster inputs from team.data.google if present
    const g = teamRow?.data?.google;
    if (g?.sheetId) setSheetLink(g.sheetId); // if stored as id, we still show it
    if (g?.range) {
      // try parse "Tab!A:P"
      const m = String(g.range).match(/^(.+)!([A-Z]+):([A-Z]+)$/i);
      if (m) {
        setSheetTab(m[1]);
        setStartCol(m[2]);
        setEndCol(m[3]);
      }
    }

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
      if (!sheetId) throw new Error("Please paste a Google Sheet link (or ID).");
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

      setTeam({ ...team, data: nextData });
    } catch (e: any) {
      setError(e?.message ?? "Failed to save roster.");
    } finally {
      setSavingRoster(false);
    }
  }

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

      const ins = await supabase.from("boards").insert([{ team_id: teamId, name, data }]).select().single();
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
    const del = await supabase.from("boards").delete().eq("id", boardId);
    if (del.error) {
      setError(del.error.message);
      return;
    }
    setBoards((cur) => cur.filter((b) => b.id !== boardId));
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="flex items-center justify-between px-8 py-6 border-b">
        <div className="min-w-0">
          <div className="text-3xl font-bold truncate">{team?.name || "Team"}</div>
          <div className="text-gray-600">Boards</div>
        </div>
        <div className="flex items-center gap-4">
          <Link className="underline" href="/app/teams">
            Teams
          </Link>
          <Link className="underline" href="/">
            Home
          </Link>
        </div>
      </div>

      {error ? <div className="px-8 py-3 text-red-600">{error}</div> : null}

      {loading ? (
        <div className="p-8">Loading...</div>
      ) : (
        <div className="p-8 max-w-5xl mx-auto space-y-6">
          {/* Existing boards FIRST */}
          <div className="border rounded-2xl p-6">
            <div className="text-xl font-semibold mb-1">Team Boards</div>
            <div className="text-gray-600 mb-4">Open an existing board or delete one.</div>

            {boards.length === 0 ? (
              <div className="text-gray-600">No boards yet. Create one below.</div>
            ) : (
              <div className="space-y-3">
                {boards.map((b) => (
                  <div
                    key={b.id}
                    className="border rounded-xl px-4 py-3 flex items-center justify-between"
                  >
                    <div className="font-medium">{b.name}</div>
                    <div className="flex items-center gap-3">
                      <Link className="underline" href={`/app/boards/${b.id}`}>
                        Open →
                      </Link>
                      <button
                        className="border px-3 py-1 rounded text-sm bg-white"
                        onClick={() => deleteBoard(b.id, b.name)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Roster + Create board */}
          <div className="border rounded-2xl p-6">
            <div className="text-xl font-semibold mb-1">Roster + Create a Board</div>
            <div className="text-gray-600 mb-4">
              Set the roster once per team. New boards will automatically load the roster.
            </div>

            <div className="border rounded-xl p-4">
              <div className="font-semibold mb-3">Team Roster (Google Sheets)</div>

              <label className="block text-sm font-medium mb-1">Google Sheet link</label>
              <input
                className="w-full border rounded px-3 py-2 mb-2"
                value={sheetLink}
                onChange={(e) => setSheetLink(e.target.value)}
                placeholder="Paste full Google Sheet link here"
              />

              <div className="text-sm text-gray-600 mb-3">
                Detected Sheet ID: <span className="font-mono">{detectedSheetId || "(none yet)"}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium mb-1">Sheet tab name</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={sheetTab}
                    onChange={(e) => setSheetTab(e.target.value)}
                    placeholder="Player Detail"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Start column</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={startCol}
                    onChange={(e) => setStartCol(e.target.value)}
                    placeholder="A"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">End column</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={endCol}
                    onChange={(e) => setEndCol(e.target.value)}
                    placeholder="P"
                  />
                </div>
              </div>

              <div className="text-sm text-gray-600 mt-3">
                We’ll use this range: <span className="font-mono">{computedRange || "(fill fields above)"}</span>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  className="rounded-md bg-black px-5 py-2 text-white disabled:opacity-60"
                  disabled={savingRoster}
                  onClick={saveRoster}
                >
                  {savingRoster ? "Saving..." : "Save roster"}
                </button>
              </div>
            </div>

            <div className="border rounded-xl p-4 mt-4">
              <div className="font-semibold mb-1">Create a Board</div>
              <div className="text-gray-600 text-sm mb-3">Example: Varsity Lineup vs Skyridge</div>

              <div className="flex gap-3">
                <input
                  className="flex-1 border rounded px-3 py-2"
                  value={newBoardName}
                  onChange={(e) => setNewBoardName(e.target.value)}
                  placeholder="Board name"
                />
                <button
                  className="rounded-md bg-black px-5 py-2 text-white disabled:opacity-60"
                  disabled={creatingBoard}
                  onClick={createBoard}
                >
                  {creatingBoard ? "Creating..." : "Create"}
                </button>
              </div>
              <div className="text-gray-600 text-sm mt-2">
                New boards will automatically load the roster.
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
