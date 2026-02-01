"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

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

type Tool = "select" | "lane" | "note" | "text";

const DEFAULT_W = 180;
const DEFAULT_H = 250;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function rectNorm(x1: number, y1: number, x2: number, y2: number) {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(y1, y2);
  const bottom = Math.max(y1, y2);
  return { left, top, right, bottom, w: right - left, h: bottom - top };
}

function rectIntersects(a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

type DragMode = "move" | "resize" | "box";

type DragState = {
  pointerId: number;
  ids: string[];
  mode: DragMode;
  startX: number;
  startY: number;
  moved: boolean;
  lastClientX: number;
  lastClientY: number;
  originPlayers: Record<string, { x: number; y: number; w: number; h: number }>;
  originObjects: Record<string, { x: number; y: number; w: number; h: number }>;
  resizeHandle?: "nw" | "ne" | "sw" | "se";
};

type TwoFingerState = {
  active: boolean;
  lastCx: number;
  lastCy: number;
};

export function HtmlBoard(props: {
  boardId: string;
  teamId: string;
  editMode: boolean;
  players: Player[];
  placed: PlacedPlayer[];
  onPlacedChange: (next: PlacedPlayer[]) => void;
  objects: BoardObject[];
  onObjectsChange?: (next: BoardObject[]) => void;
  onSave?: (next: any) => Promise<void> | void;
  canvasWidth: number;
  canvasHeight: number;
  backgroundUrl?: string;
  backgroundW?: number;
  backgroundH?: number;
}) {
  const {
    editMode,
    players,
    placed,
    onPlacedChange,
    objects,
    onObjectsChange,
    canvasWidth,
    canvasHeight,
    backgroundUrl,
    backgroundW,
    backgroundH,
  } = props;

  const [tool, setTool] = useState<Tool>("select");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [box, setBox] = useState<null | { x1: number; y1: number; x2: number; y2: number }>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);

  // card size mode
  const [cardSizeMode] = useState<"small" | "large">("small");

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  const placedRef = useRef<PlacedPlayer[]>(placed);
  const objectsRef = useRef<BoardObject[]>(objects);
  const selectedRef = useRef<Set<string>>(selectedIds);

  useEffect(() => {
    placedRef.current = placed;
  }, [placed]);
  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);
  useEffect(() => {
    selectedRef.current = selectedIds;
  }, [selectedIds]);

  const onPlacedChangeRef = useRef(onPlacedChange);
  useEffect(() => {
    onPlacedChangeRef.current = onPlacedChange;
  }, [onPlacedChange]);

  const onObjectsChangeRef = useRef(onObjectsChange);
  useEffect(() => {
    onObjectsChangeRef.current = onObjectsChange;
  }, [onObjectsChange]);

  // pointer tracking for two-finger scroll
  const pointersRef = useRef<Map<number, { x: number; y: number; pointerType: string }>>(new Map());
  const twoFingerRef = useRef<TwoFingerState | null>(null);

  // drag state
  const dragRef = useRef<DragState | null>(null);

  // Mouse/pen click-drag panning in View mode (background only)
  const panRef = useRef<null | {
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startScrollLeft: number;
    startScrollTop: number;
  }>(null);

  // Helpers
  const getPlayerById = useCallback(
    (playerId: string) => players.find((p) => p.id === playerId),
    [players]
  );

  const clientToBoard = useCallback((clientX: number, clientY: number) => {
    const sc = scrollRef.current;
    const canvas = canvasRef.current;
    if (!sc || !canvas) return { x: clientX, y: clientY };

    const canvasRect = canvas.getBoundingClientRect();
    const x = clientX - canvasRect.left + sc.scrollLeft;
    const y = clientY - canvasRect.top + sc.scrollTop;

    return { x, y };
  }, []);

  function uuid() {
    return Math.random().toString(16).slice(2) + "-" + Math.random().toString(16).slice(2);
  }

  function createObject(type: BoardObject["type"], x: number, y: number) {
    const base: BoardObject = {
      id: uuid(),
      type,
      x: clamp(x, 0, canvasWidth - 300),
      y: clamp(y, 0, canvasHeight - 120),
      w: type === "lane" ? 900 : 300,
      h: type === "lane" ? 260 : 140,
      text: type === "lane" ? "Lane" : type === "note" ? "Note" : "Text",
      fill: type === "note" ? "#fff7cc" : "#ffffff",
      stroke: "#111827",
      locked: false,
    };
    const next = [...objectsRef.current, base];
    onObjectsChangeRef.current?.(next);
    setSelectedIds(new Set([base.id]));
    setActiveId(base.id);
    setTool("select");
  }

  // Delete selected objects (not players)
  function deleteSelectedObjects() {
    const sel = selectedRef.current;
    if (!sel.size) return;

    const objIds = new Set(objectsRef.current.map((o) => o.id));
    const toDelete = [...sel].filter((id) => objIds.has(id));
    if (!toDelete.length) return;

    const next = objectsRef.current.filter((o) => !toDelete.includes(o.id));
    onObjectsChangeRef.current?.(next);
    setSelectedIds(new Set());
    setActiveId(null);
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!editMode) return;

      if (e.key === "Escape") {
        setTool("select");
        setBox(null);
        dragRef.current = null;
        setEditingId(null);
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (editingIdRef.current) return;
        deleteSelectedObjects();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode]);

  // ---------- pointer handlers ----------
  function onPointerDownCanvas(e: React.PointerEvent) {
    // Track touch pointers for two-finger scroll
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

    // only respond when clicking on the canvas background (not child elements)
    if (e.target !== canvasRef.current) return;

    // if inline editing, click-away should just end editing (blur will persist)
    if (editingIdRef.current) {
      setEditingId(null);
    }

    // View mode: click-drag the empty canvas to pan/scroll (mouse/pen)
    if (!editMode && e.pointerType !== "touch") {
      const sc = scrollRef.current;
      if (sc) {
        panRef.current = {
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startScrollLeft: sc.scrollLeft,
          startScrollTop: sc.scrollTop,
        };

        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        sc.style.cursor = "grabbing";
        e.preventDefault();
        return;
      }
    }

    const pt = clientToBoard(e.clientX, e.clientY);

    if (editMode && tool !== "select") {
      createObject(tool === "lane" ? "lane" : tool === "note" ? "note" : "text", pt.x, pt.y);
      e.preventDefault();
      return;
    }

    // start box select on desktop/mouse/pen when in select tool
    if (
      editMode &&
      tool === "select" &&
      e.pointerType !== "touch" &&
      !(e as any).metaKey &&
      !(e as any).ctrlKey &&
      !(e as any).shiftKey
    ) {
      dragRef.current = {
        pointerId: e.pointerId,
        ids: [],
        mode: "box",
        startX: pt.x,
        startY: pt.y,
        moved: false,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        originPlayers: {},
        originObjects: {},
      };
      setBox({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });

      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }

    // clicking blank clears selection
    setActiveId(null);
    setSelectedIds(new Set());
  }

  function onPointerMove(e: React.PointerEvent) {
    // two-finger scroll
    const tf = twoFingerRef.current;
    if (tf?.active && e.pointerType === "touch") {
      const ptrs = pointersRef.current;
      if (ptrs.size >= 2) {
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

    // View mode pan (mouse/pen)
    const pan = panRef.current;
    if (pan && e.pointerId === pan.pointerId) {
      const sc = scrollRef.current;
      if (sc) {
        const dx = e.clientX - pan.startClientX;
        const dy = e.clientY - pan.startClientY;
        sc.scrollLeft = pan.startScrollLeft - dx;
        sc.scrollTop = pan.startScrollTop - dy;
        e.preventDefault();
        return;
      }
    }

    const d = dragRef.current;
    if (!d) return;
    if (e.pointerId !== d.pointerId) return;

    const pt = clientToBoard(e.clientX, e.clientY);

    const dist = Math.hypot(e.clientX - d.lastClientX, e.clientY - d.lastClientY);
    if (dist > 2) d.moved = true;

    if (d.mode === "box") {
      setBox((cur) => (cur ? { ...cur, x2: pt.x, y2: pt.y } : { x1: d.startX, y1: d.startY, x2: pt.x, y2: pt.y }));
      e.preventDefault();
      return;
    }

    if (d.mode === "move") {
      const dx = pt.x - d.startX;
      const dy = pt.y - d.startY;

      // players
      const nextPlayers = placedRef.current.map((p) => {
        const o = d.originPlayers[p.id];
        if (!o) return p;
        const w = o.w;
        const h = o.h;
        const x = clamp(o.x + dx, 0, canvasWidth - w);
        const y = clamp(o.y + dy, 0, canvasHeight - h);

        if (cardSizeMode === "large") {
          return { ...p, x, y, w, h };
        }
        return { ...p, x, y };
      });

      // objects
      const nextObjects = objectsRef.current.map((o) => {
        const oo = d.originObjects[o.id];
        if (!oo) return o;
        const x = clamp(oo.x + dx, 0, canvasWidth - oo.w);
        const y = clamp(oo.y + dy, 0, canvasHeight - oo.h);
        return { ...o, x, y };
      });

      onPlacedChangeRef.current(nextPlayers);
      onObjectsChangeRef.current?.(nextObjects);
    } else if (d.mode === "resize") {
      const id = d.ids[0];
      if (!id) return;

      const oo = d.originObjects[id];
      if (!oo) return;

      const dx = pt.x - d.startX;
      const dy = pt.y - d.startY;

      let x = oo.x;
      let y = oo.y;
      let w = oo.w;
      let h = oo.h;

      const handle = d.resizeHandle ?? "se";

      if (handle.includes("e")) w = clamp(oo.w + dx, 80, canvasWidth - oo.x);
      if (handle.includes("s")) h = clamp(oo.h + dy, 60, canvasHeight - oo.y);

      if (handle.includes("w")) {
        const nx = clamp(oo.x + dx, 0, oo.x + oo.w - 80);
        w = clamp(oo.w - (nx - oo.x), 80, oo.x + oo.w);
        x = nx;
      }

      if (handle.includes("n")) {
        const ny = clamp(oo.y + dy, 0, oo.y + oo.h - 60);
        h = clamp(oo.h - (ny - oo.y), 60, oo.y + oo.h);
        y = ny;
      }

      const nextObjects = objectsRef.current.map((o) => (o.id === id ? { ...o, x, y, w, h } : o));
      onObjectsChangeRef.current?.(nextObjects);
    }
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

    // finish view-mode panning
    const pan = panRef.current;
    if (pan && e.pointerId === pan.pointerId) {
      panRef.current = null;
      const sc = scrollRef.current;
      if (sc) sc.style.cursor = "default";
      return;
    }

    const d = dragRef.current;
    if (!d) return;
    if (e.pointerId !== d.pointerId) return;

    if (d.mode === "box") {
      const bx = box;
      setBox(null);
      dragRef.current = null;

      if (!bx) return;

      const r = rectNorm(bx.x1, bx.y1, bx.x2, bx.y2);
      if (r.w < 6 && r.h < 6) {
        setActiveId(null);
        setSelectedIds(new Set());
        return;
      }

      const selected = new Set<string>();

      for (const p of placedRef.current) {
        const w = Number.isFinite(p.w) ? (p.w as number) : DEFAULT_W;
        const h = Number.isFinite(p.h) ? (p.h as number) : DEFAULT_H;
        const pr = { left: p.x, top: p.y, right: p.x + w, bottom: p.y + h };
        if (rectIntersects(pr, { left: r.left, top: r.top, right: r.right, bottom: r.bottom })) selected.add(p.id);
      }
      for (const o of objectsRef.current) {
        const or = { left: o.x, top: o.y, right: o.x + o.w, bottom: o.y + o.h };
        if (rectIntersects(or, { left: r.left, top: r.top, right: r.right, bottom: r.bottom })) selected.add(o.id);
      }

      setSelectedIds(selected);
      setActiveId(selected.size ? Array.from(selected)[0] : null);
      return;
    }

    dragRef.current = null;
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

  // ---------- object updates / delete ----------
  function updateObject(id: string, patch: Partial<BoardObject>) {
    const next = objectsRef.current.map((o) => (o.id === id ? { ...o, ...patch } : o));
    onObjectsChangeRef.current?.(next);
  }

  // ---------- render ----------
  return (
    <div className="w-full h-full flex flex-col">
      {/* toolbar */}
      <div className="flex items-center gap-2 p-2 border-b bg-white">
        <button
          className={cn("px-2 py-1 rounded border text-xs", tool === "select" ? "bg-gray-900 text-white border-gray-900" : "bg-white")}
          onClick={() => setTool("select")}
          disabled={!editMode}
          title={!editMode ? "Enable edit mode to use tools" : "Select"}
        >
          Select
        </button>
        <button
          className={cn("px-2 py-1 rounded border text-xs", tool === "lane" ? "bg-gray-900 text-white border-gray-900" : "bg-white")}
          onClick={() => setTool("lane")}
          disabled={!editMode}
          title={!editMode ? "Enable edit mode to use tools" : "Add lane"}
        >
          Lane
        </button>
        <button
          className={cn("px-2 py-1 rounded border text-xs", tool === "note" ? "bg-gray-900 text-white border-gray-900" : "bg-white")}
          onClick={() => setTool("note")}
          disabled={!editMode}
          title={!editMode ? "Enable edit mode to use tools" : "Add note"}
        >
          Note
        </button>
        <button
          className={cn("px-2 py-1 rounded border text-xs", tool === "text" ? "bg-gray-900 text-white border-gray-900" : "bg-white")}
          onClick={() => setTool("text")}
          disabled={!editMode}
          title={!editMode ? "Enable edit mode to use tools" : "Add text"}
        >
          Text
        </button>

        <div className="ml-auto text-xs text-gray-500">
          {editMode ? "Edit mode" : "View mode"} • {players.length} players
        </div>
      </div>

      {/* scroll container */}
      <div ref={scrollRef} className="w-full h-full min-w-0 min-h-0 overflow-auto bg-white">
        {/* canvas */}
        <div
          ref={canvasRef}
          className="relative select-none"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            ...bgStyle,
          }}
          onPointerDown={onPointerDownCanvas}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          {/* objects */}
          {objects.map((o) => (
            <div
              key={o.id}
              className="absolute rounded border"
              style={{
                left: o.x,
                top: o.y,
                width: o.w,
                height: o.h,
                background: o.fill ?? "#fff",
                borderColor: o.stroke ?? "#111827",
              }}
            >
              <div className="w-full h-full p-2 text-sm">
                {editingId === o.id ? (
                  <textarea
                    className="w-full h-full outline-none bg-transparent resize-none"
                    autoFocus
                    defaultValue={o.text ?? ""}
                    onBlur={(e) => {
                      updateObject(o.id, { text: e.target.value });
                      setEditingId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setEditingId(null);
                      }
                    }}
                  />
                ) : (
                  <div
                    className="w-full h-full"
                    onDoubleClick={() => {
                      if (!editMode) return;
                      setEditingId(o.id);
                    }}
                  >
                    {o.text ?? ""}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* placed players */}
          {placed.map((pp) => {
            const p = getPlayerById(pp.player_id);
            if (!p) return null;

            const w = Number.isFinite(pp.w) ? (pp.w as number) : DEFAULT_W;
            const h = Number.isFinite(pp.h) ? (pp.h as number) : DEFAULT_H;

            return (
              <div
                key={pp.id}
                className="absolute rounded-xl border bg-white shadow-sm overflow-hidden"
                style={{ left: pp.x, top: pp.y, width: w, height: h }}
              >
                <div className="p-2 text-xs font-semibold truncate">{p.name ?? "Player"}</div>
              </div>
            );
          })}

          {/* box select */}
          {box ? (
            <div
              className="absolute border border-blue-500 bg-blue-200/20 pointer-events-none"
              style={{
                left: Math.min(box.x1, box.x2),
                top: Math.min(box.y1, box.y2),
                width: Math.abs(box.x2 - box.x1),
                height: Math.abs(box.y2 - box.y1),
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
