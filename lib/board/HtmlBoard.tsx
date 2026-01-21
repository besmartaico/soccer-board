"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

export type CanvasPlayer = {
  playerId: string;
  name: string;
  grade?: string;
  returning?: string;
  primary?: string;
  likelihood?: string;
  pos1?: string;
  pos2?: string;
  pictureUrl?: string;
};

export type PlacedPlayer = {
  id: string;
  player: CanvasPlayer;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Props = {
  editMode: boolean;
  placed: PlacedPlayer[];
  onPlacedChange: (next: PlacedPlayer[]) => void;
  backgroundUrl?: string;
  dragMime?: string;

  /**
   * Optional: set a bigger/smaller canvas area to scroll around.
   * Defaults are intentionally large so your background has room.
   */
  canvasWidth?: number;  // default 3200
  canvasHeight?: number; // default 2000
};

const DEFAULT_W = 280;
const DEFAULT_H = 96;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  const out = `${first}${last}`.toUpperCase();
  return out || "?";
}

function buildLine1(p: CanvasPlayer) {
  const grade = p.grade ? `Grade: ${p.grade}` : "Grade: ?";
  const pos = p.pos1 ? `Pos: ${p.pos1}${p.pos2 ? ` / ${p.pos2}` : ""}` : "Pos: ?";
  const ret = p.returning ? `Returning: ${p.returning}` : "Returning: ?";
  return `${grade} • ${pos} • ${ret}`;
}

function buildLine2(p: CanvasPlayer) {
  const prim = p.primary ? `Primary: ${p.primary}` : "Primary: ?";
  const lik = p.likelihood ? `Likelihood: ${p.likelihood}` : "Likelihood: ?";
  return `${prim} • ${lik}`;
}

function canAcceptDrag(e: React.DragEvent, dragMime: string) {
  const types = Array.from(e.dataTransfer.types || []);
  return (
    types.includes(dragMime) ||
    types.includes("application/json") ||
    types.includes("text/plain")
  );
}

function readPayload(dt: DataTransfer, dragMime: string): any | null {
  const rawCustom = dt.getData(dragMime);
  if (rawCustom) {
    try {
      return JSON.parse(rawCustom);
    } catch {}
  }

  const rawJson = dt.getData("application/json");
  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch {}
  }

  const rawText = dt.getData("text/plain");
  if (rawText) {
    try {
      return JSON.parse(rawText);
    } catch {}
  }

  return null;
}

export function HtmlBoard({
  editMode,
  placed,
  onPlacedChange,
  backgroundUrl,
  dragMime = "application/x-soccerboard-player",
  canvasWidth = 3200,
  canvasHeight = 2000,
}: Props) {
  // This is the *scroll container*
  const scrollRef = useRef<HTMLDivElement | null>(null);
  // This is the *inner canvas* (positioning happens relative to this)
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // keep latest placed + callback for global listeners
  const placedRef = useRef<PlacedPlayer[]>(placed);
  const onPlacedChangeRef = useRef(onPlacedChange);

  useEffect(() => {
    placedRef.current = placed;
  }, [placed]);

  useEffect(() => {
    onPlacedChangeRef.current = onPlacedChange;
  }, [onPlacedChange]);

  const placedById = useMemo(() => {
    const m = new Map<string, PlacedPlayer>();
    for (const p of placed) m.set(p.id, p);
    return m;
  }, [placed]);

  const [isDragOver, setIsDragOver] = useState(false);

  // lightweight “preview” while dragging a placed card
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number } | null>(
    null
  );

  const draggingRef = useRef<{
    id: string;
    pointerId: number;
    dx: number;
    dy: number;
    nextX: number;
    nextY: number;
    rafPending: boolean;
  } | null>(null);

  /**
   * Convert client coords to canvas coords.
   * IMPORTANT: because we have a scroll container, we add scrollLeft/scrollTop.
   */
  function clientToCanvas(clientX: number, clientY: number) {
    const canvasEl = canvasRef.current;
    const scrollEl = scrollRef.current;
    if (!canvasEl || !scrollEl) return { x: 0, y: 0 };

    const r = canvasEl.getBoundingClientRect();
    const x = clientX - r.left + scrollEl.scrollLeft;
    const y = clientY - r.top + scrollEl.scrollTop;
    return { x, y };
  }

  function onDragOver(e: React.DragEvent) {
    if (!editMode) return;
    if (!canAcceptDrag(e, dragMime)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }

  function onDragLeave() {
    setIsDragOver(false);
  }

  function onDrop(e: React.DragEvent) {
    setIsDragOver(false);
    if (!editMode) return;
    if (!canAcceptDrag(e, dragMime)) return;

    e.preventDefault();
    const payload = readPayload(e.dataTransfer, dragMime);
    if (!payload) return;

    const pt = clientToCanvas(e.clientX, e.clientY);

    const next: PlacedPlayer = {
      id: `${payload.id || "p"}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      x: pt.x,
      y: pt.y,
      w: DEFAULT_W,
      h: DEFAULT_H,
      player: {
        playerId: payload.id ?? "",
        name: payload.name ?? "Player",
        grade: payload.grade ?? "",
        returning: payload.returning ?? "",
        primary: payload.primary ?? "",
        likelihood: payload.likelihood ?? "",
        pos1: payload.pos1 ?? "",
        pos2: payload.pos2 ?? "",
        pictureUrl: payload.pictureUrl ?? "",
      },
    };

    onPlacedChangeRef.current([...placedRef.current, next]);
  }

  function beginMove(e: React.PointerEvent, id: string) {
    if (!editMode) return;

    // left click only
    if ((e as any).buttons !== undefined && (e as any).buttons !== 1) return;

    const card = placedById.get(id);
    if (!card) return;

    (e.currentTarget as HTMLDivElement).setPointerCapture?.(e.pointerId);

    const pt = clientToCanvas(e.clientX, e.clientY);

    draggingRef.current = {
      id,
      pointerId: e.pointerId,
      dx: pt.x - card.x,
      dy: pt.y - card.y,
      nextX: card.x,
      nextY: card.y,
      rafPending: false,
    };

    setDragPreview({ id, x: card.x, y: card.y });
  }

  function schedulePreviewUpdate() {
    const d = draggingRef.current;
    if (!d || d.rafPending) return;
    d.rafPending = true;

    requestAnimationFrame(() => {
      const dd = draggingRef.current;
      if (!dd) return;
      dd.rafPending = false;
      setDragPreview({ id: dd.id, x: dd.nextX, y: dd.nextY });
    });
  }

  useEffect(() => {
    function onMove(ev: PointerEvent) {
      const d = draggingRef.current;
      if (!d) return;
      if (ev.pointerId !== d.pointerId) return;

      const currentPlaced = placedRef.current;
      const card = currentPlaced.find((p) => p.id === d.id);

      const w = card?.w ?? DEFAULT_W;
      const h = card?.h ?? DEFAULT_H;

      const pt = clientToCanvas(ev.clientX, ev.clientY);

      // clamp to canvas bounds
      const x = clamp(pt.x - d.dx, 0, canvasWidth - w);
      const y = clamp(pt.y - d.dy, 0, canvasHeight - h);

      d.nextX = x;
      d.nextY = y;

      schedulePreviewUpdate();
    }

    function onUp(ev: PointerEvent) {
      const d = draggingRef.current;
      if (!d) return;
      if (ev.pointerId !== d.pointerId) return;

      const currentPlaced = placedRef.current;
      const card = currentPlaced.find((p) => p.id === d.id);

      const finalX = d.nextX;
      const finalY = d.nextY;

      draggingRef.current = null;
      setDragPreview(null);

      if (!card) return;

      const next = currentPlaced.map((p) =>
        p.id === card.id ? { ...p, x: finalX, y: finalY } : p
      );
      onPlacedChangeRef.current(next);
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [canvasWidth, canvasHeight]);

  function removePlaced(id: string) {
    const next = placedRef.current.filter((p) => p.id !== id);
    onPlacedChangeRef.current(next);
  }

  const canvasStyle: React.CSSProperties = backgroundUrl
    ? {
        backgroundImage: `url(${backgroundUrl})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "top left",
        backgroundSize: "contain", // shows entire image within canvas bounds
      }
    : {};

  return (
    <div
      ref={scrollRef}
      className="w-full h-full overflow-auto bg-white"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        ref={canvasRef}
        className="relative"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          ...canvasStyle,
        }}
      >
        {/* subtle grid */}
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.06]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #000 1px, transparent 1px), linear-gradient(to bottom, #000 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />

        {editMode && isDragOver ? (
          <div className="pointer-events-none absolute inset-0 ring-4 ring-blue-500/35 z-10" />
        ) : null}

        <div className="absolute inset-0 z-20" style={{ touchAction: "none" }}>
          {placed.map((p) => {
            const isDragging = dragPreview?.id === p.id;
            const x = isDragging ? dragPreview!.x : p.x;
            const y = isDragging ? dragPreview!.y : p.y;

            const w = Number.isFinite(p.w) ? p.w : DEFAULT_W;
            const h = Number.isFinite(p.h) ? p.h : DEFAULT_H;

            return (
              <div
                key={p.id}
                className={`absolute rounded-xl border shadow-sm bg-white select-none ${
                  editMode ? "cursor-grab active:cursor-grabbing" : "cursor-default"
                }`}
                style={{ left: x, top: y, width: w, height: h, userSelect: "none" }}
                onPointerDown={(e) => beginMove(e, p.id)}
              >
                {/* remove button */}
                {editMode ? (
                  <button
                    type="button"
                    className="absolute top-1 right-1 z-10 w-6 h-6 rounded-full border bg-white text-xs leading-none"
                    title="Remove from board"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      removePlaced(p.id);
                    }}
                  >
                    ✕
                  </button>
                ) : null}

                <div className="flex h-full">
                  <div className="w-[88px] h-full bg-gray-100 border-r rounded-l-xl overflow-hidden flex items-center justify-center">
                    {p.player.pictureUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.player.pictureUrl}
                        alt={`${p.player.name} photo`}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        draggable={false}
                      />
                    ) : (
                      <div className="text-lg font-bold text-gray-800">
                        {getInitials(p.player.name)}
                      </div>
                    )}
                  </div>

                  <div className="flex-1 p-2 overflow-hidden">
                    <div className="font-semibold text-sm truncate">{p.player.name || "Player"}</div>
                    <div className="text-[12px] text-gray-700 truncate">{buildLine1(p.player)}</div>
                    <div className="text-[12px] text-gray-700 truncate">{buildLine2(p.player)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
