"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type PlayerPayload = {
  id: string;
  name: string;
  grade?: string;
  returning?: string;
  primary?: string;
  likelihood?: string;
  pos1?: string;
  pos2?: string;
  notes?: string;
  pictureUrl?: string;
};

export type PlacedPlayer = {
  id: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  player: PlayerPayload;
};

export type BoardTool = "select" | "lane" | "text" | "note";

export type BoardObject = {
  id: string;
  kind: "lane" | "text" | "note";
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string;
  text?: string;
  color?: string;
};

type Props = {
  placedPlayers: PlacedPlayer[];
  objects: BoardObject[];
  tool: BoardTool;
  mode: "view" | "edit";
  armedPlayer?: PlayerPayload | null;
  onConsumeArmedPlayer?: () => void;
  onPlayersChange: (p: PlacedPlayer[]) => void;
  onObjectsChange: (o: BoardObject[]) => void;
};

export function HtmlBoard({
  placedPlayers,
  objects,
  tool,
  mode,
  armedPlayer,
  onConsumeArmedPlayer,
  onPlayersChange,
  onObjectsChange,
}: Props) {
  const boardRef = useRef<HTMLDivElement>(null);
  const editingRef = useRef<HTMLElement | null>(null);

  /* -------- Commit inline text edits -------- */
  useEffect(() => {
    const handler = () => {
      if (!editingRef.current) return;
      const el = editingRef.current;
      const id = el.dataset["id"];
      if (!id) return;

      onObjectsChange(
        objects.map(o =>
          o.id === id ? { ...o, text: el.innerText } : o
        )
      );
      editingRef.current = null;
    };

    window.addEventListener("soccerboard:commit-edits", handler);
    return () => window.removeEventListener("soccerboard:commit-edits", handler);
  }, [objects, onObjectsChange]);

  /* -------- Tap-to-place on touch -------- */
  function handleBoardClick(e: React.MouseEvent) {
    if (!armedPlayer || mode !== "edit") return;
    const rect = boardRef.current!.getBoundingClientRect();

    onPlayersChange([
      ...placedPlayers,
      {
        id: crypto.randomUUID(),
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        player: armedPlayer,
      },
    ]);

    onConsumeArmedPlayer?.();
  }

  return (
    <div
      ref={boardRef}
      className="relative w-full h-full bg-green-700 overflow-auto"
      style={{
        touchAction: mode === "view" ? "pan-x pan-y" : "none",
      }}
      onClick={handleBoardClick}
    >
      {objects.map(o => (
        <div
          key={o.id}
          data-id={o.id}
          contentEditable={mode === "edit"}
          suppressContentEditableWarning
          onFocus={e => (editingRef.current = e.currentTarget)}
          onBlur={() =>
            window.dispatchEvent(new Event("soccerboard:commit-edits"))
          }
          className="absolute bg-white border rounded p-2 text-sm"
          style={{
            left: o.x,
            top: o.y,
            width: o.w,
            height: o.h,
            cursor: mode === "edit" ? "move" : "default",
            pointerEvents: mode === "edit" ? "auto" : "none",
          }}
        >
          {o.text}
        </div>
      ))}
    </div>
  );
}
