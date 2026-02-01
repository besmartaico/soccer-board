"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { BoardPageClient } from "./BoardPageClient";
import { HtmlBoard } from "@/lib/board/HtmlBoard";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

// Types (local to keep this file self-contained)
type Team = {
  id: string;
  name: string | null;
  created_at: string;
};

type Board = {
  id: string;
  team_id: string;
  name: string | null;
  created_at: string;
  updated_at: string;
  is_published?: boolean | null;
  published_at?: string | null;
};

type Player = {
  id: string;
  team_id: string;
  name: string | null;
  number: number | null;
  position: string | null;
  group: string | null;
  image_url: string | null;
  created_at: string;
};

type PlacedPlayer = {
  id: string;
  player_id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  meta?: Record<string, any> | null;
};

type BoardObject = {
  id: string;
  type: "lane" | "note" | "text";
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  fill?: string;
  stroke?: string;
  locked?: boolean;
};

type BoardState = {
  placed_players: PlacedPlayer[];
  objects: BoardObject[];
  background_url?: string | null;
  background_w?: number | null;
  background_h?: number | null;
};

const DEFAULT_CANVAS_W = 6000;
const DEFAULT_CANVAS_H = 4000;

export default function BoardPage({ params }: { params: { boardId: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  const boardId = params.boardId;

  // ----- page state -----
  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<Team | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [placed, setPlaced] = useState<PlacedPlayer[]>([]);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [backgroundW, setBackgroundW] = useState<number | null>(null);
  const [backgroundH, setBackgroundH] = useState<number | null>(null);

  const [editMode, setEditMode] = useState(false);

  // canvas sizing
  const canvasW = DEFAULT_CANVAS_W;
  const canvasH = DEFAULT_CANVAS_H;

  // ---- load board / team / players ----
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);

      // get board
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

      // get team
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

      // get players
      const { data: playerRows, error: playerErr } = await supabase
        .from("players")
        .select("*")
        .eq("team_id", teamRow.id)
        .order("number", { ascending: true });

      if (playerErr) {
        console.error("Failed to load players", playerErr);
      }

      // load board_state
      const { data: stateRows, error: stateErr } = await supabase
        .from("board_state")
        .select("*")
        .eq("board_id", boardId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (stateErr) {
        console.error("Failed to load board_state", stateErr);
      }

      const latest = stateRows?.[0]?.state as BoardState | undefined;

      if (!cancelled) {
        setBoard(boardRow);
        setTeam(teamRow);
        setPlayers(playerRows ?? []);
        setPlaced(latest?.placed_players ?? []);
        setObjects(latest?.objects ?? []);
        setBackgroundUrl(latest?.background_url ?? null);
        setBackgroundW(latest?.background_w ?? null);
        setBackgroundH(latest?.background_h ?? null);
        setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [boardId, supabase]);

  // ---- edit mode from query param (optional) ----
  useEffect(() => {
    const mode = searchParams.get("mode");
    if (mode === "edit") setEditMode(true);
    if (mode === "view") setEditMode(false);
  }, [searchParams]);

  // ---- save handler (BoardPageClient may call) ----
  const saveBoardState = useCallback(
    async (next: Partial<BoardState>) => {
      const state: BoardState = {
        placed_players: next.placed_players ?? placed,
        objects: next.objects ?? objects,
        background_url: next.background_url ?? backgroundUrl,
        background_w: next.background_w ?? backgroundW,
        background_h: next.background_h ?? backgroundH,
      };

      const { error } = await supabase.from("board_state").insert({
        board_id: boardId,
        state,
      });

      if (error) {
        console.error("Save failed", error);
      }
    },
    [supabase, boardId, placed, objects, backgroundUrl, backgroundW, backgroundH]
  );

  const updatePlaced = useCallback(
    (next: PlacedPlayer[]) => {
      setPlaced(next);
    },
    [setPlaced]
  );

  const updateObjects = useCallback(
    (next: BoardObject[]) => {
      setObjects(next);
    },
    [setObjects]
  );

  // ---- publish toggle ----
  const togglePublish = useCallback(async () => {
    if (!board) return;
    const nextPublished = !board.is_published;

    const { data, error } = await supabase
      .from("boards")
      .update({
        is_published: nextPublished,
        published_at: nextPublished ? new Date().toISOString() : null,
      })
      .eq("id", board.id)
      .select("*")
      .single();

    if (error) {
      console.error("Publish toggle failed", error);
      return;
    }
    setBoard(data);
  }, [board, supabase]);

  // ---- basic rendering ----
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-600">Loading…</div>
      </main>
    );
  }

  if (!board || !team) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-red-600">Board not found.</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 overflow-hidden">
      {/* header */}
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
            <div className="font-semibold truncate">
              {board.name ?? "Board"}
            </div>
          </div>

          {board.is_published ? (
            <span className="text-xs px-2 py-1 rounded bg-green-50 text-green-700 border border-green-200">
              Published
            </span>
          ) : (
            <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 border border-gray-200">
              Draft
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditMode((v) => !v)}
            className={cn(
              "text-sm px-3 py-2 rounded border",
              editMode
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
            )}
          >
            {editMode ? "Edit Mode" : "View Mode"}
          </button>

          <button
            onClick={togglePublish}
            className={cn(
              "text-sm px-3 py-2 rounded border",
              board.is_published
                ? "bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
                : "bg-green-600 text-white border-green-600 hover:bg-green-700"
            )}
          >
            {board.is_published ? "Unpublish" : "Publish"}
          </button>
        </div>
      </div>

      {/* content */}
      {/* IMPORTANT: min-w-0 on flex row + board pane is what restores horizontal scrolling */}
      <div className="flex h-[calc(100vh-73px)] min-w-0">
        {/* left panel (controls) */}
        <aside className="w-[360px] border-r bg-white overflow-y-auto relative z-30">
          <BoardPageClient
            teamId={team.id}
            boardId={boardId}
            editMode={editMode}
            setEditMode={setEditMode}
            players={players}
            placed={placed}
            setPlaced={setPlaced}
            objects={objects}
            setObjects={setObjects}
            backgroundUrl={backgroundUrl}
            setBackgroundUrl={setBackgroundUrl}
            backgroundW={backgroundW}
            setBackgroundW={setBackgroundW}
            backgroundH={backgroundH}
            setBackgroundH={setBackgroundH}
            saveBoardState={saveBoardState}
          />
        </aside>

        {/* board */}
        <section className="flex-1 min-w-0 relative z-0">
          <HtmlBoard
            editMode={editMode}
            boardId={boardId}
            teamId={team.id}
            players={players}
            placed={placed}
            onPlacedChange={updatePlaced}
            objects={objects}
            onObjectsChange={updateObjects}
            onSave={saveBoardState}
            canvasWidth={canvasW}
            canvasHeight={canvasH}
            backgroundUrl={backgroundUrl ?? undefined}
            backgroundW={backgroundW ?? undefined}
            backgroundH={backgroundH ?? undefined}
          />
        </section>
      </div>
    </main>
  );
}
