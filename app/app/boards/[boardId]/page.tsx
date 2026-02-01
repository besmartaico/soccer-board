"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getMyRole, type UserRole } from "@/lib/roles";
import { HtmlBoard, type PlacedPlayer, type BoardObject, type BoardTool } from "@/lib/board/HtmlBoard";

type BoardRow = {
  id: string;
  team_id: string;
  name: string | null;
  created_at: string;
  updated_at: string;
};

type TeamRow = {
  id: string;
  name: string | null;
  created_at: string;
};

export default function BoardPage() {
  const router = useRouter();
  const params = useParams<{ boardId: string }>();
  const boardId = params.boardId;

  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<TeamRow | null>(null);
  const [board, setBoard] = useState<BoardRow | null>(null);

  const [tool, setTool] = useState<BoardTool>("select");
  const [editMode, setEditMode] = useState(false);

  const [placedPlayers, setPlacedPlayers] = useState<PlacedPlayer[]>([]);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [backgroundW, setBackgroundW] = useState<number | null>(null);
  const [backgroundH, setBackgroundH] = useState<number | null>(null);

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [myRole, setMyRole] = useState<UserRole>("viewer");

  // Canvas size (big board)
  const canvasWidth = 6000;
  const canvasHeight = 4000;

  const loadedOnce = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      const { data: boardRow, error: boardErr } = await supabase
        .from("boards")
        .select("*")
        .eq("id", boardId)
        .single();

      if (boardErr || !boardRow) {
        console.error("Failed to load board", boardErr);
        if (!cancelled) setLoading(false);
        return;
      }

      const { data: teamRow, error: teamErr } = await supabase
        .from("teams")
        .select("*")
        .eq("id", boardRow.team_id)
        .single();

      if (teamErr || !teamRow) {
        console.error("Failed to load team", teamErr);
        if (!cancelled) setLoading(false);
        return;
      }

      const { data: stateRows, error: stateErr } = await supabase
        .from("board_state")
        .select("*")
        .eq("board_id", boardId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (stateErr) {
        console.error("Failed to load board_state", stateErr);
      }

      const latest = stateRows?.[0]?.state as
        | {
            placed_players?: PlacedPlayer[];
            objects?: BoardObject[];
            background_url?: string | null;
            background_w?: number | null;
            background_h?: number | null;
          }
        | undefined;

      const role = await getMyRole(boardRow.team_id);
      if (!cancelled) {
        setMyRole(role);

        setBoard(boardRow);
        setTeam(teamRow);

        setPlacedPlayers(latest?.placed_players ?? []);
        setObjects(latest?.objects ?? []);
        setBackgroundUrl(latest?.background_url ?? null);
        setBackgroundW(latest?.background_w ?? null);
        setBackgroundH(latest?.background_h ?? null);

        setLoading(false);
        loadedOnce.current = true;

        // default edit/view based on role
        if (role === "viewer") setEditMode(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [boardId]);

  function handlePlacedChange(next: PlacedPlayer[]) {
    setPlacedPlayers(next);
    setDirty(true);
  }

  function handleObjectsChange(next: BoardObject[]) {
    setObjects(next);
    setDirty(true);
  }

  async function save() {
    if (!board) return;
    setSaving(true);

    const state = {
      placed_players: placedPlayers,
      objects,
      background_url: backgroundUrl,
      background_w: backgroundW,
      background_h: backgroundH,
    };

    const { error } = await supabase.from("board_state").insert({
      board_id: board.id,
      state,
    });

    if (error) {
      console.error("Save failed", error);
    } else {
      setDirty(false);
    }

    setSaving(false);
  }

  function deletePlacedCard(id: string) {
    setPlacedPlayers((cur) => cur.filter((p) => p.id !== id));
    setDirty(true);
  }

  if (loading) {
    return (
      <main className="h-screen flex items-center justify-center">
        <div className="text-sm text-gray-600">Loading…</div>
      </main>
    );
  }

  if (!board || !team) {
    return (
      <main className="h-screen flex items-center justify-center">
        <div className="text-sm text-red-600">Board not found.</div>
      </main>
    );
  }

  return (
    <main className="h-screen overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white relative z-40">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href={`/app/teams/${team.id}`}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            ← Back
          </Link>

          <div className="min-w-0">
            <div className="text-xs text-gray-500">{team.name ?? "Team"}</div>
            <div className="font-semibold truncate">{board.name ?? "Board"}</div>
          </div>

          <div className="text-xs text-gray-500">
            Role: <span className="font-medium">{myRole}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* View / Edit toggle */}
          <button
            onClick={() => {
              // viewers can't enter edit mode
              if (myRole === "viewer") return;
              setEditMode((v) => !v);
            }}
            className={`text-sm px-3 py-2 rounded border ${
              editMode
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
            } ${myRole === "viewer" ? "opacity-50 cursor-not-allowed" : ""}`}
            title={myRole === "viewer" ? "You don't have edit permissions" : ""}
          >
            {editMode ? "Edit Mode" : "View Mode"}
          </button>

          {/* Save */}
          <button
            onClick={save}
            disabled={!dirty || saving}
            className={`text-sm px-3 py-2 rounded border ${
              dirty
                ? "bg-green-600 text-white border-green-600 hover:bg-green-700"
                : "bg-white text-gray-400 border-gray-200 cursor-not-allowed"
            }`}
          >
            {saving ? "Saving..." : dirty ? "Save" : "Saved"}
          </button>
        </div>
      </div>

      {/* Layout */}
      {/* IMPORTANT: min-w-0 here ensures the board pane can shrink and the inner overflow container can scroll properly */}
      <div className="flex h-[calc(100vh-73px)] min-w-0">
        {/* Left column / controls (if you have them elsewhere, keep as-is) */}
        <aside className="w-[360px] border-r bg-white overflow-y-auto relative z-30">
          <div className="p-4 space-y-3">
            <div className="text-sm font-semibold">Tools</div>

            <div className="flex flex-wrap gap-2">
              {(["select", "lane", "note", "text"] as BoardTool[]).map((t) => (
                <button
                  key={t}
                  className={`text-xs px-2 py-1 rounded border ${
                    tool === t ? "bg-gray-900 text-white border-gray-900" : "bg-white"
                  } ${!editMode ? "opacity-50 cursor-not-allowed" : ""}`}
                  disabled={!editMode}
                  onClick={() => setTool(t)}
                >
                  {t}
                </button>
              ))}
            </div>

            <div className="text-xs text-gray-500">
              Tip: In <b>View Mode</b>, you can click-drag empty canvas to pan.
            </div>
          </div>
        </aside>

        {/* Board */}
        {/* IMPORTANT: remove overflow-hidden and add min-w-0 so the internal overflow-auto shows scrollbars */}
        <section className="flex-1 min-w-0 relative z-0">
          <HtmlBoard
            tool={tool}
            editMode={editMode}
            placedPlayers={placedPlayers}
            setPlacedPlayers={handlePlacedChange}
            objects={objects}
            setObjects={handleObjectsChange}
            deletePlacedCard={deletePlacedCard}
            canvasWidth={canvasWidth}
            canvasHeight={canvasHeight}
            backgroundUrl={backgroundUrl ?? undefined}
            setBackgroundUrl={(u) => {
              setBackgroundUrl(u ?? null);
              setDirty(true);
            }}
            backgroundW={backgroundW ?? undefined}
            setBackgroundW={(v) => {
              setBackgroundW(v ?? null);
              setDirty(true);
            }}
            backgroundH={backgroundH ?? undefined}
            setBackgroundH={(v) => {
              setBackgroundH(v ?? null);
              setDirty(true);
            }}
          />
        </section>
      </div>
    </main>
  );
}
