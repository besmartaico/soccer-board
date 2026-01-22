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

const DEFAULT_W = 260;
const DEFAULT_H = 92;

const MIN_W = 110;
const MIN_H = 48;

const RESIZE_HANDLE = 14;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function getInitials(name?: string) {
  const s = (name || "").trim();
  if (!s) return "?";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function buildLine1(p: PlayerPayload) {
  const grade = p.grade ? `Grade: ${p.grade}` : "Grade: ?";
  const pos = p.pos1 ? `Pos: ${p.pos1}${p.pos2 ? ` / ${p.pos2}` : ""}` : "Pos: ?";
  const returning = p.returning ? `Returning: ${p.returning}` : "Returning: ?";
  return `${grade} • ${pos} • ${returning}`;
}

function buildLine2(p: PlayerPayload) {
  const primary = p.primary ? `Primary: ${p.primary}` : "Primary: ?";
  const like = p.likelihood ? `Likelihood: ${p.likelihood}` : "Likelihood: ?";
  return `${primary} • ${like}`;
}

export function HtmlBoard({
  editMode,
  placed,
  onPlacedChange,
  dragMime,
  backgroundUrl,
  onOpenPlayer,
  canvasWidth = 3000,
  canvasHeight = 2000,
}: {
  editMode: boolean;
  placed: PlacedPlayer[];
  onPlacedChange: (next: PlacedPlayer[]) => void;
  dragMime: string;
  backgroundUrl?: string;
  onOpenPlayer?: (p: PlacedPlayer) => void;
  canvasWidth?: number;
  canvasHeight?: number;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // keep latest placed in a ref for pointer handlers
  const placedRef = useRef<PlacedPlayer[]>(placed);
  useEffect(() => {
    placedRef.current = placed;
  }, [placed]);

  const onPlacedChangeRef = useRef(onPlacedChange);
  useEffect(() => {
    onPlacedChangeRef.current = onPlacedChange;
  }, [onPlacedChange]);

  const [isDragOver, setIsDragOver] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);

  // ---------- coordinate helpers ----------
  function clientToBoard(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }

  // ---------- drag from roster drop ----------
  function parseDragPayload(e: React.DragEvent) {
    const raw =
      e.dataTransfer.getData(dragMime) ||
      e.dataTransfer.getData("application/json") ||
      e.dataTransfer.getData("text/plain");
    if (!raw) return null;

    try {
      const p = JSON.parse(raw);
      return p as PlayerPayload;
    } catch {
      return null;
    }
  }

  function onDragOver(e: React.DragEvent) {
    if (!editMode) return;
    e.preventDefault();
    setIsDragOver(true);
    e.dataTransfer.dropEffect = "copy";
  }

  function onDragLeave() {
    setIsDragOver(false);
  }

  function onDrop(e: React.DragEvent) {
    if (!editMode) return;
    e.preventDefault();
    setIsDragOver(false);

    const payload = parseDragPayload(e);
    if (!payload) return;

    const pt = clientToBoard(e.clientX, e.clientY);
    const id = `${payload.id || payload.name}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    const w = DEFAULT_W;
    const h = DEFAULT_H;

    const nextX = clamp(pt.x - w / 2, 0, canvasWidth - w);
    const nextY = clamp(pt.y - h / 2, 0, canvasHeight - h);

    const next: PlacedPlayer[] = [
      ...placedRef.current,
      {
        id,
        x: nextX,
        y: nextY,
        w,
        h,
        player: payload,
      },
    ];

    onPlacedChangeRef.current(next);

    // try to bring into view a bit (nice UX)
    requestAnimationFrame(() => {
      const sc = scrollRef.current;
      if (!sc) return;
      const margin = 80;
      const targetLeft = clamp(nextX - margin, 0, canvasWidth);
      const targetTop = clamp(nextY - margin, 0, canvasHeight);
      sc.scrollTo({ left: targetLeft, top: targetTop, behavior: "smooth" });
    });
  }

  // ---------- moving / resizing ----------
  type DragState = {
    pointerId: number;
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
    dx: number;
    dy: number;
    moved: boolean;
    lastClientX: number;
    lastClientY: number;
  };

  const dragRef = useRef<DragState | null>(null);

  function beginMove(e: React.PointerEvent, id: string) {
    if (!editMode) return;
    if (e.button !== 0) return; // left click / primary touch
    const canvas = canvasRef.current;
    if (!canvas) return;

    const current = placedRef.current.find((p) => p.id === id);
    if (!current) return;

    setActiveId(id);

    const w = Number.isFinite(current.w) ? (current.w as number) : DEFAULT_W;
    const h = Number.isFinite(current.h) ? (current.h as number) : DEFAULT_H;

    const pt = clientToBoard(e.clientX, e.clientY);
    const dx = pt.x - current.x;
    const dy = pt.y - current.y;

    dragRef.current = {
      pointerId: e.pointerId,
      id,
      mode: "move",
      startX: pt.x,
      startY: pt.y,
      origX: current.x,
      origY: current.y,
      origW: w,
      origH: h,
      dx,
      dy,
      moved: false,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
    };

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }

  function beginResize(e: React.PointerEvent, id: string) {
    if (!editMode) return;
    if (e.button !== 0) return;
    const current = placedRef.current.find((p) => p.id === id);
    if (!current) return;

    setActiveId(id);

    const w = Number.isFinite(current.w) ? (current.w as number) : DEFAULT_W;
    const h = Number.isFinite(current.h) ? (current.h as number) : DEFAULT_H;

    const pt = clientToBoard(e.clientX, e.clientY);

    dragRef.current = {
      pointerId: e.pointerId,
      id,
      mode: "resize",
      startX: pt.x,
      startY: pt.y,
      origX: current.x,
      origY: current.y,
      origW: w,
      origH: h,
      dx: 0,
      dy: 0,
      moved: false,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
    };

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (e.pointerId !== d.pointerId) return;

    const pt = clientToBoard(e.clientX, e.clientY);

    const dist = Math.hypot(e.clientX - d.lastClientX, e.clientY - d.lastClientY);
    if (dist > 2) d.moved = true;

    const currentPlaced = placedRef.current;
    const card = currentPlaced.find((p) => p.id === d.id);
    if (!card) return;

    if (d.mode === "move") {
      const w = d.origW;
      const h = d.origH;
      const x = clamp(pt.x - d.dx, 0, canvasWidth - w);
      const y = clamp(pt.y - d.dy, 0, canvasHeight - h);

      const next = currentPlaced.map((p) => (p.id === card.id ? { ...p, x, y, w, h } : p));
      onPlacedChangeRef.current(next);
    } else {
      // resize
      const newW = clamp(d.origW + (pt.x - d.startX), MIN_W, canvasWidth - d.origX);
      const newH = clamp(d.origH + (pt.y - d.startY), MIN_H, canvasHeight - d.origY);

      const next = currentPlaced.map((p) =>
        p.id === card.id ? { ...p, w: newW, h: newH } : p
      );
      onPlacedChangeRef.current(next);
    }

    d.lastClientX = e.clientX;
    d.lastClientY = e.clientY;
    e.preventDefault();
  }

  function onPointerUp(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    if (e.pointerId !== d.pointerId) return;

    dragRef.current = null;

    // click-to-open if not moved
    if (!d.moved && onOpenPlayer) {
      const card = placedRef.current.find((p) => p.id === d.id);
      if (card) onOpenPlayer(card);
    }
  }

  // background
  const bgStyle: React.CSSProperties = useMemo(() => {
    if (!backgroundUrl) return { backgroundColor: "#fff" };
    return {
      backgroundImage: `url(${backgroundUrl})`,
      backgroundSize: "contain",
      backgroundRepeat: "no-repeat",
      backgroundPosition: "top left",
      backgroundColor: "#fff",
    };
  }, [backgroundUrl]);

  return (
    <div
      ref={scrollRef}
      className="w-full h-full overflow-auto bg-white"
      style={{
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        ref={canvasRef}
        className="relative"
        style={{
          width: canvasWidth,
          height: canvasHeight,
          ...bgStyle,
          touchAction: "none",
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerDown={() => setActiveId(null)}
      >
        {editMode && isDragOver ? (
          <div className="pointer-events-none absolute inset-0 ring-4 ring-blue-500/35 z-10" />
        ) : null}

        {/* placed cards */}
        {placed.map((p) => {
          const w = Number.isFinite(p.w) ? (p.w as number) : DEFAULT_W;
          const h = Number.isFinite(p.h) ? (p.h as number) : DEFAULT_H;
          const compact = w < 170 || h < 70;

          const isActive = activeId === p.id;

          return (
            <div
              key={p.id}
              className={`absolute rounded-xl border shadow-sm bg-white select-none ${
                editMode ? "cursor-grab active:cursor-grabbing" : "cursor-default"
              }`}
              style={{
                left: p.x,
                top: p.y,
                width: w,
                height: h,
                userSelect: "none",
                touchAction: "none",
              }}
              onPointerDown={(e) => beginMove(e, p.id)}
            >
              {compact ? (
                <div className="h-full w-full flex items-center justify-center px-2">
                  <div className="text-sm font-semibold truncate">{p.player.name || "Player"}</div>
                </div>
              ) : (
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
                      <div className="text-lg font-bold text-gray-800">{getInitials(p.player.name)}</div>
                    )}
                  </div>

                  <div className="flex-1 p-2 overflow-hidden">
                    <div className="font-semibold text-sm truncate">{p.player.name || "Player"}</div>
                    <div className="text-[12px] text-gray-700 truncate">{buildLine1(p.player)}</div>
                    <div className="text-[12px] text-gray-700 truncate">{buildLine2(p.player)}</div>
                  </div>
                </div>
              )}

              {/* resize handle */}
              {editMode ? (
                <div
                  className={`absolute right-0 bottom-0 rounded-tl bg-black/10 ${
                    isActive ? "bg-black/20" : ""
                  }`}
                  style={{
                    width: RESIZE_HANDLE,
                    height: RESIZE_HANDLE,
                    cursor: "nwse-resize",
                    touchAction: "none",
                  }}
                  onPointerDown={(e) => beginResize(e, p.id)}
                  title="Resize"
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
