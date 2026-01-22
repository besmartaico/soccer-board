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

type PointerInfo = { x: number; y: number; pointerType: string };

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Touch pointers for two-finger scroll
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());
  const twoFingerRef = useRef<{ active: boolean; lastCx: number; lastCy: number } | null>(null);

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

    // select the newly added card
    setActiveId(id);
    setSelectedIds(new Set([id]));

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
    ids: string[];
    mode: "move" | "resize";
    startX: number;
    startY: number;
    moved: boolean;
    lastClientX: number;
    lastClientY: number;
    // per-card origin snapshot
    origin: Record<
      string,
      {
        x: number;
        y: number;
        w: number;
        h: number;
      }
    >;
  };

  const dragRef = useRef<DragState | null>(null);

  function ensureSelectionOnPointerDown(id: string, e: React.PointerEvent) {
    const isMeta = (e as any).metaKey || (e as any).ctrlKey;
    const isShift = (e as any).shiftKey;

    if (isMeta) {
      // toggle
      setSelectedIds((cur) => {
        const next = new Set(cur);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next.size ? next : new Set([id]);
      });
      setActiveId(id);
      return;
    }

    if (isShift) {
      // additive (simple)
      setSelectedIds((cur) => new Set([...Array.from(cur), id]));
      setActiveId(id);
      return;
    }

    // single select
    setSelectedIds(new Set([id]));
    setActiveId(id);
  }

  function getMoveIds(id: string) {
    const sel = selectedIds;
    if (sel.has(id)) return Array.from(sel);
    return [id];
  }

  function beginMove(e: React.PointerEvent, id: string) {
    if (!editMode) return;
    if (e.button !== 0) return; // left click / primary touch

    // If this is a touch device and we already have another touch pointer down,
    // treat this as a two-finger scroll gesture (not a card drag).
    if (e.pointerType === "touch") {
      const ptrs = pointersRef.current;
      if (ptrs.size >= 2) return;
    }

    const currentPlaced = placedRef.current;
    const first = currentPlaced.find((p) => p.id === id);
    if (!first) return;

    ensureSelectionOnPointerDown(id, e);

    const ids = getMoveIds(id);

    const origin: DragState["origin"] = {};
    for (const pid of ids) {
      const p = currentPlaced.find((x) => x.id === pid);
      if (!p) continue;
      origin[pid] = {
        x: p.x,
        y: p.y,
        w: Number.isFinite(p.w) ? (p.w as number) : DEFAULT_W,
        h: Number.isFinite(p.h) ? (p.h as number) : DEFAULT_H,
      };
    }

    const pt = clientToBoard(e.clientX, e.clientY);

    dragRef.current = {
      pointerId: e.pointerId,
      ids,
      mode: "move",
      startX: pt.x,
      startY: pt.y,
      moved: false,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      origin,
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
    setSelectedIds(new Set([id]));

    const w = Number.isFinite(current.w) ? (current.w as number) : DEFAULT_W;
    const h = Number.isFinite(current.h) ? (current.h as number) : DEFAULT_H;

    const pt = clientToBoard(e.clientX, e.clientY);

    dragRef.current = {
      pointerId: e.pointerId,
      ids: [id],
      mode: "resize",
      startX: pt.x,
      startY: pt.y,
      moved: false,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      origin: {
        [id]: { x: current.x, y: current.y, w, h },
      },
    };

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }

  function onPointerMove(e: React.PointerEvent) {
    // 1) two-finger scroll (touch only) — does not require editMode
    const tf = twoFingerRef.current;
    if (tf?.active && e.pointerType === "touch") {
      const ptrs = pointersRef.current;
      if (ptrs.size >= 2) {
        // update this pointer
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, pointerType: e.pointerType });

        const pts = Array.from(ptrs.values()).slice(0, 2);
        const cx = (pts[0].x + pts[1].x) / 2;
        const cy = (pts[0].y + pts[1].y) / 2;

        const dx = cx - tf.lastCx;
        const dy = cy - tf.lastCy;

        tf.lastCx = cx;
        tf.lastCy = cy;

        const sc = scrollRef.current;
        if (sc) {
          sc.scrollLeft -= dx;
          sc.scrollTop -= dy;
        }

        e.preventDefault();
        return;
      }
    }

    // 2) card drag / resize
    const d = dragRef.current;
    if (!d) return;
    if (e.pointerId !== d.pointerId) return;

    const pt = clientToBoard(e.clientX, e.clientY);

    const dist = Math.hypot(e.clientX - d.lastClientX, e.clientY - d.lastClientY);
    if (dist > 2) d.moved = true;

    const currentPlaced = placedRef.current;

    if (d.mode === "move") {
      const dx = pt.x - d.startX;
      const dy = pt.y - d.startY;

      const next = currentPlaced.map((p) => {
        if (!d.origin[p.id]) return p;
        const o = d.origin[p.id];
        const w = o.w;
        const h = o.h;
        const x = clamp(o.x + dx, 0, canvasWidth - w);
        const y = clamp(o.y + dy, 0, canvasHeight - h);
        return { ...p, x, y, w, h };
      });

      onPlacedChangeRef.current(next);
    } else {
      // resize only first id
      const id = d.ids[0];
      const o = d.origin[id];
      if (!o) return;

      const newW = clamp(o.w + (pt.x - d.startX), MIN_W, canvasWidth - o.x);
      const newH = clamp(o.h + (pt.y - d.startY), MIN_H, canvasHeight - o.y);

      const next = currentPlaced.map((p) => (p.id === id ? { ...p, w: newW, h: newH } : p));
      onPlacedChangeRef.current(next);
    }

    d.lastClientX = e.clientX;
    d.lastClientY = e.clientY;
    e.preventDefault();
  }

  function onPointerUp(e: React.PointerEvent) {
    // pointer tracking for two-finger scroll
    if (e.pointerType === "touch") {
      pointersRef.current.delete(e.pointerId);

      const tf = twoFingerRef.current;
      if (tf?.active && pointersRef.current.size < 2) {
        twoFingerRef.current = null;
      }
    }

    const d = dragRef.current;
    if (!d) return;
    if (e.pointerId !== d.pointerId) return;

    dragRef.current = null;

    // click-to-open if not moved
    if (!d.moved && d.ids.length === 1 && onOpenPlayer) {
      const card = placedRef.current.find((p) => p.id === d.ids[0]);
      if (card) onOpenPlayer(card);
    }
  }

  function onPointerDownCanvas(e: React.PointerEvent) {
    // Track touch pointers so we can do two-finger scroll
    if (e.pointerType === "touch") {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, pointerType: e.pointerType });

      if (pointersRef.current.size >= 2) {
        const pts = Array.from(pointersRef.current.values()).slice(0, 2);
        twoFingerRef.current = {
          active: true,
          lastCx: (pts[0].x + pts[1].x) / 2,
          lastCy: (pts[0].y + pts[1].y) / 2,
        };
      }
    }

    // clicking blank space clears selection
    if ((e.target as HTMLElement) === canvasRef.current) {
      setActiveId(null);
      setSelectedIds(new Set());
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
          // We keep touchAction none so single-finger drags stay responsive,
          // and we implement custom two-finger scrolling above.
          touchAction: "none",
        }}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onPointerDown={onPointerDownCanvas}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {editMode && isDragOver ? (
          <div className="pointer-events-none absolute inset-0 ring-4 ring-blue-500/35 z-10" />
        ) : null}

        {/* placed cards */}
        {placed.map((p) => {
          const w = Number.isFinite(p.w) ? (p.w as number) : DEFAULT_W;
          const h = Number.isFinite(p.h) ? (p.h as number) : DEFAULT_H;

          // Show less info sooner as the card shrinks — but ALWAYS show the name (wrapping).
          const showPhoto = w >= 160 && h >= 64;
          const showLine1 = w >= 220 && h >= 76;
          const showLine2 = w >= 240 && h >= 86;

          const isActive = activeId === p.id;
          const isSelected = selectedIds.has(p.id);

          return (
            <div
              key={p.id}
              className={`absolute rounded-xl border shadow-sm bg-white select-none ${
                editMode ? "cursor-grab active:cursor-grabbing" : "cursor-default"
              } ${isSelected ? "ring-2 ring-blue-500/50" : ""} ${isActive ? "ring-blue-600/70" : ""}`}
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
              <div className="flex h-full">
                {showPhoto ? (
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
                ) : null}

                <div className="flex-1 p-2 overflow-hidden">
                  {/* Name ALWAYS visible; wrap instead of truncating */}
                  <div
                    className="font-semibold text-sm text-gray-900 break-words whitespace-normal leading-tight"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {p.player.name || "Player"}
                  </div>

                  {showLine1 ? (
                    <div className="text-[12px] text-gray-700 mt-1 overflow-hidden whitespace-nowrap text-ellipsis">
                      {buildLine1(p.player)}
                    </div>
                  ) : null}

                  {showLine2 ? (
                    <div className="text-[12px] text-gray-700 mt-1 overflow-hidden whitespace-nowrap text-ellipsis">
                      {buildLine2(p.player)}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* resize handle */}
              {editMode ? (
                <div
                  className={`absolute right-0 bottom-0 rounded-tl bg-black/10 ${isActive ? "bg-black/20" : ""}`}
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
