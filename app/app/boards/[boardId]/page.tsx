"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {
  HtmlBoard,
  PlacedPlayer,
  BoardObject,
  BoardTool,
  PlayerPayload,
} from "@/lib/board/HtmlBoard";

export default function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();

  const isTouch =
    typeof window !== "undefined" &&
    ("ontouchstart" in window || navigator.maxTouchPoints > 0);

  const [mode, setMode] = useState<"view" | "edit">(isTouch ? "view" : "edit");
  const [tool, setTool] = useState<BoardTool>("select");
  const [players, setPlayers] = useState<PlacedPlayer[]>([]);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [armedPlayer, setArmedPlayer] = useState<PlayerPayload | null>(null);

  function commitEdits() {
    window.dispatchEvent(new Event("soccerboard:commit-edits"));
  }

  async function saveBoard() {
    commitEdits();
    await supabase.from("boards").update({
      data: { players, objects },
    }).eq("id", boardId);
  }

  function printBoard() {
    commitEdits();
    setTimeout(() => window.print(), 50);
  }

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center gap-2 p-2 border-b">
        <button onClick={() => setMode(m => (m === "view" ? "edit" : "view"))}>
          {mode === "view" ? "👁 View" : "✏️ Edit"}
        </button>
        <button onClick={saveBoard}>Save</button>
        <button onClick={printBoard}>Print</button>
      </div>

      <div className="flex flex-1">
        <aside className="w-64 border-r p-2">
          <div className="font-semibold mb-2">Roster</div>
          {/* Example roster item */}
          <div
            className="p-2 bg-gray-100 rounded cursor-pointer"
            onClick={() =>
              isTouch && setArmedPlayer({ id: "demo", name: "Player" })
            }
          >
            Tap to add
          </div>
        </aside>

        <main className="flex-1">
          <HtmlBoard
            placedPlayers={players}
            objects={objects}
            tool={tool}
            mode={mode}
            armedPlayer={armedPlayer}
            onConsumeArmedPlayer={() => setArmedPlayer(null)}
            onPlayersChange={setPlayers}
            onObjectsChange={setObjects}
          />
        </main>
      </div>
    </div>
  );
}
