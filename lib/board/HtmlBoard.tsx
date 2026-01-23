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
  title?: string; // lane
  text?: string; // text/note
  color?: string; // note bg
  locked?: boolean;
};

const DEFAULT_W = 260;
const DEFAULT_H = 92;

const MIN_W = 110;
const MIN_H = 48;

const OBJ_MIN_W = 80;
const OBJ_MIN_H = 40;

const RESIZE_HANDLE = 14;

const LARGE_CARD = { w: 260, h: 92 };
const MEDIUM_CARD = { w: 210, h: 72 };
const SMALL_CARD = { w: 150, h: 52 };

function getEffectiveCardSize(mode: "large" | "medium" | "small", p: PlacedPlayer) {
  if (mode === "medium") return MEDIUM_CARD;
  if (mode === "small") return SMALL_CARD;
  const w = Number.isFinite(p.w) ? (p.w as number) : DEFAULT_W;
  const h = Number.isFinite(p.h) ? (p.h as number) : DEFAULT_H;
  return { w, h };
}


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

function normalizeGrade(g?: string) {
  const n = Number(String(g ?? "").trim());
  if (!Number.isFinite(n)) return null;
  return n;
}

function gradeColor(grade?: string) {
  const g = normalizeGrade(grade);
  if (g === 12) return "#74213c";
  if (g === 11) return "#c7b782";
  if (g === 10) return "#808080";
  if (g === 9) return "#000000";
  return "#d1d5db"; // fallback gray
}

function isDark(hex: string) {
  // naive luminance check for contrast; expects #RRGGBB
  const h = hex.replace("#", "");
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // relative luminance approximation
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum < 140;
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

type DragState = {
  pointerId: number;
  ids: string[];
  mode: "move" | "resize" | "box";
  startX: number;
  startY: number;
  moved: boolean;
  lastClientX: number;
  lastClientY: number;
  originPlayers: Record<string, { x: number; y: number; w: number; h: number }>;
  originObjects: Record<string, { x: number; y: number; w: number; h: number }>;
};

export function HtmlBoard({
  editMode,
  placed,
  onPlacedChange,
  dragMime,
  backgroundUrl,
  onOpenPlayer,
  canvasWidth = 3000,
  canvasHeight = 2000,

  // new: board objects (lanes/text/notes)
  objects = [],
  onObjectsChange,

  // new: active tool
  tool = "select",
  onToolChange,

  // new: canvas-level card sizing
  cardSizeMode = "large",
}: {
  editMode: boolean;
  placed: PlacedPlayer[];
  onPlacedChange: (next: PlacedPlayer[]) => void;
  dragMime: string;
  backgroundUrl?: string;
  onOpenPlayer?: (p: PlacedPlayer) => void;
  canvasWidth?: number;
  canvasHeight?: number;

  objects?: BoardObject[];
  onObjectsChange?: (next: BoardObject[]) => void;

  tool?: BoardTool;
  onToolChange?: (t: BoardTool) => void;

  cardSizeMode?: "large" | "medium" | "small";
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // latest state refs for pointer handlers
  const placedRef = useRef<PlacedPlayer[]>(placed);
  useEffect(() => void (placedRef.current = placed), [placed]);

  const objectsRef = useRef<BoardObject[]>(objects);
  useEffect(() => void (objectsRef.current = objects), [objects]);

  const onPlacedChangeRef = useRef(onPlacedChange);
  useEffect(() => void (onPlacedChangeRef.current = onPlacedChange), [onPlacedChange]);

  const onObjectsChangeRef = useRef(onObjectsChange);
  useEffect(() => void (onObjectsChangeRef.current = onObjectsChange), [onObjectsChange]);

  const [isDragOver, setIsDragOver] = useState(false);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    selectedIdsRef.current = selectedIds;
  }, [selectedIds]);


  // Touch pointers for two-finger scroll
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());
  const twoFingerRef = useRef<{ active: boolean; lastCx: number; lastCy: number } | null>(null);

  // Selection box
  const [box, setBox] = useState<null | { x1: number; y1: number; x2: number; y2: number }>(null);

  const dragRef = useRef<DragState | null>(null);

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

  function rectNorm(x1: number, y1: number, x2: number, y2: number) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const right = Math.max(x1, x2);
    const bottom = Math.max(y1, y2);
    return { left, top, right, bottom, w: right - left, h: bottom - top };
  }

  function rectIntersects(a: { left: number; top: number; right: number; bottom: number }, b: { left: number; top: number; right: number; bottom: number }) {
    return !(b.left > a.right || b.right < a.left || b.top > a.bottom || b.bottom < a.top);
  }

  function anySelected() {
    return selectedIds.size > 0;
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

    const eff = cardSizeMode === "small" ? SMALL_CARD : cardSizeMode === "medium" ? MEDIUM_CARD : LARGE_CARD;
    const w = eff.w;
    const h = eff.h;

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

    setActiveId(id);
    setSelectedIds(new Set([id]));
  }

  // ---------- selection helpers ----------
  function ensureSelectionOnPointerDown(id: string, e: React.PointerEvent) {
    const isMeta = (e as any).metaKey || (e as any).ctrlKey;
    const isShift = (e as any).shiftKey;

    if (isMeta) {
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
      setSelectedIds((cur) => new Set([...Array.from(cur), id]));
      setActiveId(id);
      return;
    }

    setSelectedIds(new Set([id]));
    setActiveId(id);
  }

  function getMoveIds(id: string) {
    if (selectedIds.has(id)) return Array.from(selectedIds);
    return [id];
  }

  function snapshotOrigins(ids: string[]) {
    const originPlayers: DragState["originPlayers"] = {};
    const originObjects: DragState["originObjects"] = {};

    for (const pid of ids) {
      const p = placedRef.current.find((x) => x.id === pid);
      if (p) {
        originPlayers[pid] = {
          x: p.x,
          y: p.y,
          w: Number.isFinite(p.w) ? (p.w as number) : DEFAULT_W,
          h: Number.isFinite(p.h) ? (p.h as number) : DEFAULT_H,
        };
        continue;
      }

      const o = objectsRef.current.find((x) => x.id === pid);
      if (o) {
        originObjects[pid] = { x: o.x, y: o.y, w: o.w, h: o.h };
      }
    }

    return { originPlayers, originObjects };
  }

  // ---------- moving / resizing ----------
  function beginMoveAny(e: React.PointerEvent, id: string) {
    if (!editMode) return;
    if (e.button !== 0) return;

    // if touch and already 2 fingers down, ignore (two-finger scroll)
    if (e.pointerType === "touch") {
      if (pointersRef.current.size >= 2) return;
    }

    ensureSelectionOnPointerDown(id, e);

    const ids = getMoveIds(id);
    const { originPlayers, originObjects } = snapshotOrigins(ids);

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
      originPlayers,
      originObjects,
    };

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // Don't call preventDefault here; it can block dblclick needed for editing text/notes.
    e.stopPropagation();
  }

  function beginResizeAny(e: React.PointerEvent, id: string) {
    if (!editMode) return;
    if (e.button !== 0) return;

    setActiveId(id);
    setSelectedIds(new Set([id]));

    const { originPlayers, originObjects } = snapshotOrigins([id]);
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
      originPlayers,
      originObjects,
    };

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }

  // ---------- tools (create objects) ----------
  function createObject(kind: BoardObject["kind"], x: number, y: number) {
    const id = `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    let obj: BoardObject;
    if (kind === "lane") {
      obj = {
        id,
        kind,
        x: clamp(x, 0, canvasWidth - 600),
        y: clamp(y, 0, canvasHeight - 200),
        w: 600,
        h: 200,
        title: "",
      };
    } else if (kind === "note") {
      obj = {
        id,
        kind,
        x: clamp(x, 0, canvasWidth - 220),
        y: clamp(y, 0, canvasHeight - 160),
        w: 220,
        h: 160,
        text: "Sticky note...",
        color: "#fff7b2",
      };
    } else {
      obj = {
        id,
        kind: "text",
        x: clamp(x, 0, canvasWidth - 260),
        y: clamp(y, 0, canvasHeight - 120),
        w: 260,
        h: 120,
        text: "Text...",
      };
    }

    const next = [...objectsRef.current, obj];
    onObjectsChangeRef.current?.(next);

    setActiveId(id);
    setSelectedIds(new Set([id]));

    // auto-return to select tool for convenience
    onToolChange?.("select");
  }

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

    const pt = clientToBoard(e.clientX, e.clientY);

    if (editMode && tool !== "select") {
      // create a new object
      createObject(tool === "lane" ? "lane" : tool === "note" ? "note" : "text", pt.x, pt.y);
      e.preventDefault();
      return;
    }

    // start box select on desktop/mouse/pen when in select tool
    if (editMode && tool === "select" && e.pointerType !== "touch" && !(e as any).metaKey && !(e as any).ctrlKey && !(e as any).shiftKey) {
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

    // otherwise clicking blank clears selection
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

      // resize player if exists
      const op = d.originPlayers[id];
      if (op) {
        const newW = clamp(op.w + (pt.x - d.startX), MIN_W, canvasWidth - op.x);
        const newH = clamp(op.h + (pt.y - d.startY), MIN_H, canvasHeight - op.y);
        const nextPlayers = placedRef.current.map((p) => (p.id === id ? { ...p, w: newW, h: newH } : p));
        onPlacedChangeRef.current(nextPlayers);
        e.preventDefault();
        return;
      }

      // resize object
      const oo = d.originObjects[id];
      if (oo) {
        const newW = clamp(oo.w + (pt.x - d.startX), OBJ_MIN_W, canvasWidth - oo.x);
        const newH = clamp(oo.h + (pt.y - d.startY), OBJ_MIN_H, canvasHeight - oo.y);
        const nextObjects = objectsRef.current.map((o) => (o.id === id ? { ...o, w: newW, h: newH } : o));
        onObjectsChangeRef.current?.(nextObjects);
        e.preventDefault();
        return;
      }
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

    if (d.mode === "box") {
      const bx = box;
      setBox(null);
      dragRef.current = null;

      if (!bx) return;

      const r = rectNorm(bx.x1, bx.y1, bx.x2, bx.y2);
      // very small box = treat as click (clears selection)
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

  // ---------- object editing ----------
  function updateObject(id: string, patch: Partial<BoardObject>) {
    const next = objectsRef.current.map((o) => (o.id === id ? { ...o, ...patch } : o));
    onObjectsChangeRef.current?.(next);
  }

  
function deleteSelectedObjects(ids: string[]) {
  if (!ids.length) return;
  const set = new Set(ids);
  const next = objectsRef.current.filter((o) => !set.has(o.id));
  onObjectsChangeRef.current?.(next);

  // clear selection if we deleted selected objects
  setSelectedIds((cur) => {
    const n = new Set(cur);
    ids.forEach((id) => n.delete(id));
    return n;
  });
  setActiveId((cur) => (cur && set.has(cur) ? null : cur));
}

// Keyboard delete/backspace to remove selected board objects (lanes/text/notes)
useEffect(() => {
  function onKeyDown(e: KeyboardEvent) {
    if (!editMode) return;
    if (e.key !== "Delete" && e.key !== "Backspace") return;

    const objIds = new Set(objectsRef.current.map((o) => o.id));
    const toDelete = Array.from(selectedIdsRef.current).filter((id) => objIds.has(id));
    if (!toDelete.length) return;

    e.preventDefault();
    deleteSelectedObjects(toDelete);
  }

  window.addEventListener("keydown", onKeyDown);
  return () => window.removeEventListener("keydown", onKeyDown);
}, [editMode]);
// ---------- rendering ----------
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
          // Keep touchAction none so single-finger drags stay responsive.
          // We implement custom two-finger scrolling above.
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
        {editMode && isDragOver ? <div className="pointer-events-none absolute inset-0 ring-4 ring-blue-500/35 z-10" /> : null}

        {/* Selection box */}
        {box ? (
          (() => {
            const r = rectNorm(box.x1, box.y1, box.x2, box.y2);
            return (
              <div
                className="pointer-events-none absolute z-20 border border-blue-500 bg-blue-200/15"
                style={{ left: r.left, top: r.top, width: r.w, height: r.h }}
              />
            );
          })()
        ) : null}

        {/* Board Objects (lanes/text/notes) - render behind players */}
        {objects.map((o) => {
          const isSelected = selectedIds.has(o.id);
          const isActive = activeId === o.id;

          if (o.kind === "lane") {
            return (
              <div
                key={o.id}
                className={`absolute rounded-xl border bg-white/60 ${
                  isSelected ? "ring-2 ring-blue-500/50" : ""
                } ${isActive ? "ring-blue-600/70" : ""}`}
                style={{
                  left: o.x,
                  top: o.y,
                  width: o.w,
                  height: o.h,
                  zIndex: 1,
                  backdropFilter: "blur(2px)",
                }}
                onPointerDown={(e) => beginMoveAny(e, o.id)}
              >
                <div
  className="px-3 py-2 text-sm font-semibold text-gray-800 flex items-center justify-between select-none"
  title={editMode ? "Double-click to rename lane" : undefined}
  onDoubleClick={(e) => {
    if (!editMode) return;
    e.stopPropagation();
    const next = window.prompt("Lane title:", o.title || "");
    if (next === null) return;
    updateObject(o.id, { title: next.trim() });
  }}
>
  <div className="min-w-0 truncate">{o.title || ""}</div>

  {editMode && isSelected ? (
    <button
      type="button"
      className="ml-2 inline-flex items-center justify-center w-7 h-7 rounded hover:bg-red-50 text-red-600 border border-red-200 bg-white/80"
      title="Delete"
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        deleteSelectedObjects([o.id]);
      }}
    >
      ×
    </button>
  ) : null}
</div>

                {/* resize handle */}
                {editMode ? (
                  <div
                    className="absolute right-0 bottom-0 rounded-tl bg-black/10"
                    style={{
                      width: RESIZE_HANDLE,
                      height: RESIZE_HANDLE,
                      cursor: "nwse-resize",
                      touchAction: "none",
                    }}
                    onPointerDown={(e) => beginResizeAny(e, o.id)}
                    title="Resize"
                  />
                ) : null}
              </div>
            );
          }

const isNote = o.kind === "note";
const isText = o.kind === "text";
const bg = isNote ? o.color || "#fff7b2" : "transparent";

return (
  <div
    key={o.id}
    className={`absolute ${isNote ? "rounded-xl border shadow-sm" : ""} ${
      isSelected ? "ring-2 ring-blue-500/50" : ""
    } ${isActive ? "ring-blue-600/70" : ""}`}
              style={{
                left: o.x,
                top: o.y,
                width: o.w,
                height: o.h,
                zIndex: 2,
                background: bg,
              }}
              onPointerDown={(e) => beginMoveAny(e, o.id)}
            >
              <div
  className="w-full h-full p-2 text-sm overflow-auto"
  style={{
    outline: "none",
    whiteSpace: "pre-wrap",
    cursor: editMode ? "inherit" : "default",
  }}
  title={editMode ? "Double-click to edit text" : undefined}
  onDoubleClick={(e) => {
    if (!editMode) return;
    e.stopPropagation();
    const current = o.text || "";
    const next = window.prompt("Text:", current);
    if (next === null) return;
    updateObject(o.id, { text: next });
  }}
>
  {o.text || ""}
</div>

              {editMode && isSelected ? (
                <button
                  type="button"
                  className="absolute top-1 right-1 inline-flex items-center justify-center w-7 h-7 rounded hover:bg-red-50 text-red-600 border border-red-200 bg-white/80"
                  title="Delete"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSelectedObjects([o.id]);
                  }}
                >
                  ×
                </button>
              ) : null}

              {editMode ? (
                <div
                  className="absolute right-0 bottom-0 rounded-tl bg-black/10"
                  style={{
                    width: RESIZE_HANDLE,
                    height: RESIZE_HANDLE,
                    cursor: "nwse-resize",
                    touchAction: "none",
                  }}
                  onPointerDown={(e) => beginResizeAny(e, o.id)}
                  title="Resize"
                />
              ) : null}
            </div>
          );
        })}

        {/* placed player cards */}
        {placed.map((p) => {
          const effSize = getEffectiveCardSize(cardSizeMode, p);
          const w = effSize.w;
          const h = effSize.h;

          const showPhoto = cardSizeMode !== "small";
          const showLine1 = cardSizeMode === "large";
          const showLine2 = cardSizeMode === "large";

          const isActive = activeId === p.id;
          const isSelected = selectedIds.has(p.id);

          const gCol = gradeColor(p.player.grade);
          const onDark = isDark(gCol);

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
                zIndex: 5,
                borderColor: gCol,
              }}
              onPointerDown={(e) => beginMoveAny(e, p.id)}
            >
              {/* grade color bar on top (does not consume card space) */}
              <div
                className="absolute left-0 top-0 w-full rounded-t-xl"
                style={{
                  height: 6,
                  background: gCol,
                }}
              />

              <div className="flex h-full pt-[6px]">
                {showPhoto ? (
                  <div
                    className="w-[88px] h-full bg-gray-100 border-r rounded-bl-xl overflow-hidden flex items-center justify-center relative"
                    onPointerDown={(e) => {
                      // photo click opens details; do not drag
                      e.preventDefault();
                      e.stopPropagation();
                      ensureSelectionOnPointerDown(p.id, e);
                      onOpenPlayer?.(p);
                    }}
                    title="Open details"
                    style={{ cursor: "pointer" }}
                  >
                    {p.player.pictureUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.player.pictureUrl}
                        alt={`${p.player.name} photo`}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        draggable={false}
                      />
                    ) : (
                      <div className="text-lg font-bold" style={{ color: onDark ? "#ffffff" : "#111827" }}>
                        {getInitials(p.player.name)}
                      </div>
                    )}
                  </div>
                ) : null}

                {/* Body: click/select + drag */}
                <div className="flex-1 p-2 overflow-hidden">
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
              {false ? (
                <div
                  className="absolute right-0 bottom-0 rounded-tl bg-black/10"
                  style={{
                    width: RESIZE_HANDLE,
                    height: RESIZE_HANDLE,
                    cursor: "nwse-resize",
                    touchAction: "none",
                  }}
                  onPointerDown={(e) => beginResizeAny(e, p.id)}
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
