"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type PlacedPlayer = {
  instanceId: string; // unique per placement
  playerId: string;
  name: string;
  grade?: string;
  returning?: string;
  primary?: string;
  likelihood?: string;
  pos1?: string;
  pos2?: string;
  notes?: string;
  pictureUrl?: string;

  x: number;
  y: number;
};

type Props = {
  editMode: boolean;
  placed: PlacedPlayer[];
  onPlacedChange: (next: PlacedPlayer[]) => void;
  dragMime: string;
  backgroundUrl?: string;

  // NEW: allow scroll canvas size
  canvasWidth?: number;  // defaults to 3000
  canvasHeight?: number; // defaults to 2000
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function HtmlBoard({
  editMode,
  placed,
  onPlacedChange,
  dragMime,
  backgroundUrl,
  canvasWidth = 3000,
  canvasHeight = 2000,
}: Props) {
  const boardRef = useRef<HTMLDivElement | null>(null);

  // drag move state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const dragOffsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  // selection for delete key
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const placedById = useMemo(() => {
    const m = new Map<string, PlacedPlayer>();
    for (const p of placed) m.set(p.instanceId, p);
    return m;
  }, [placed]);

  // Keyboard delete/backspace removes selected
  useEffect(() => {
    if (!editMode) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onPlacedChange(placed.filter((p) => p.instanceId !== selectedId));
        setSelectedId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editMode, selectedId, placed, onPlacedChange]);

  // Mouse move / up handlers for dragging placed cards
  useEffect(() => {
    if (!editMode) return;

    const onMove = (e: MouseEvent) => {
      if (!draggingId) return;
      const el = boardRef.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left - dragOffsetRef.current.dx;
      const y = e.clientY - rect.top - dragOffsetRef.current.dy;

      const next = placed.map((p) => {
        if (p.instanceId !== draggingId) return p;
        // keep inside canvas (rough bounds)
        return {
          ...p,
          x: clamp(x, 0, canvasWidth - 260),
          y: clamp(y, 0, canvasHeight - 90),
        };
      });

      onPlacedChange(next);
    };

    const onUp = () => setDraggingId(null);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [editMode, draggingId, placed, onPlacedChange, canvasWidth, canvasHeight]);

  function onDrop(e: React.DragEvent) {
    if (!editMode) return;

    e.preventDefault();
    const raw = e.dataTransfer.getData(dragMime) || e.dataTransfer.getData("application/json");
    if (!raw) return;

    let payload: any = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      return;
    }

    const el = boardRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const instanceId = `${payload.id || "player"}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`;

    const next: PlacedPlayer[] = [
      ...placed,
      {
        instanceId,
        playerId: (payload.id ?? "").toString(),
        name: (payload.name ?? "Player").toString(),
        grade: payload.grade,
        returning: payload.returning,
        primary: payload.primary,
        likelihood: payload.likelihood,
        pos1: payload.pos1,
        pos2: payload.pos2,
        notes: payload.notes,
        pictureUrl: payload.pictureUrl,

        x: clamp(x, 0, canvasWidth - 260),
        y: clamp(y, 0, canvasHeight - 90),
      },
    ];

    onPlacedChange(next);
    setSelectedId(instanceId);
  }

  function onDragOver(e: React.DragEvent) {
    if (!editMode) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  return (
    <div className="w-full h-full">
      {/* IMPORTANT:
          The parent page will be the scroll container.
          This element is the large canvas to scroll around.
      */}
      <div
        ref={boardRef}
        className="relative select-none"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          backgroundColor: "#ffffff",
          backgroundImage: backgroundUrl ? `url(${backgroundUrl})` : undefined,
          backgroundRepeat: "no-repeat",
          backgroundPosition: "top left",
          backgroundSize: "contain",
        }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onMouseDown={() => {
          // clicking empty space clears selection
          setSelectedId(null);
        }}
      >
        {placed.map((p) => {
          const isSelected = selectedId === p.instanceId;

          return (
            <div
              key={p.instanceId}
              className={`absolute rounded-lg border bg-white shadow-sm ${
                isSelected ? "ring-2 ring-black" : ""
              }`}
              style={{
                left: p.x,
                top: p.y,
                width: 260,
                height: 86,
              }}
              onMouseDown={(e) => {
                // select, then start drag if editMode
                e.stopPropagation();
                setSelectedId(p.instanceId);

                if (!editMode) return;

                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                dragOffsetRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
                setDraggingId(p.instanceId);
              }}
            >
              {/* Remove button */}
              {editMode ? (
                <button
                  type="button"
                  title="Remove from board"
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-black text-white text-sm leading-6"
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlacedChange(placed.filter((x) => x.instanceId !== p.instanceId));
                    if (selectedId === p.instanceId) setSelectedId(null);
                  }}
                >
                  ×
                </button>
              ) : null}

              <div className="flex h-full">
                <div className="w-[74px] h-full border-r flex items-center justify-center overflow-hidden rounded-l-lg bg-gray-50">
                  {p.pictureUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.pictureUrl}
                      alt={p.name}
                      className="w-full h-full object-cover"
                      draggable={false}
                    />
                  ) : (
                    <div className="text-sm font-semibold text-gray-700">
                      {initials(p.name)}
                    </div>
                  )}
                </div>

                <div className="flex-1 p-2 min-w-0">
                  <div className="font-semibold text-sm truncate">{p.name}</div>
                  <div className="text-xs text-gray-700 truncate">
                    Grade: {p.grade || "?"} • Pos: {p.pos1 || "?"}
                    {p.pos2 ? ` / ${p.pos2}` : ""} • Returning: {p.returning || "?"}
                  </div>
                  <div className="text-xs text-gray-700 truncate">
                    Primary: {p.primary || "?"} • Likelihood: {p.likelihood || "?"}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const a = parts[0]?.[0] || "";
  const b = parts.length > 1 ? parts[parts.length - 1]?.[0] || "" : "";
  return (a + b).toUpperCase();
}
