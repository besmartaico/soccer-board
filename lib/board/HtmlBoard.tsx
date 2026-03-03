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
  kind: "lane" | "text" | "note" | "token";
  x: number;
  y: number;
  w: number;
  h: number;
  title?: string; // lane
  text?: string; // text/note
  color?: string; // note bg
  tokenColor?: string; // token
  tokenLabel?: string; // token
  tokenType?: "circle" | "ball"; // token
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

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 2.5;

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
  return "#d1d5db";
}

function isDark(hex: string) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
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
  playerDragMime,
  objectDragMime,
  backgroundUrl,
  onOpenPlayer,
  canvasWidth = 3000,
  canvasHeight = 2000,
  objects = [],
  onObjectsChange,
  tool = "select",
  onToolChange,
  cardSizeMode = "large",
}: {
  editMode: boolean;
  placed: PlacedPlayer[];
  onPlacedChange: (next: PlacedPlayer[]) => void;
  playerDragMime: string;
  objectDragMime: string;
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
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Zoom state (slider-driven)
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(1);
  useEffect(() => void (zoomRef.current = zoom), [zoom]);

  // Zoom UI state
  const [zoomUiCollapsed, setZoomUiCollapsed] = useState(false);

  function setZoomCentered(nextZoomRaw: number) {
    const el = scrollRef.current;
    if (!el) {
      setZoom(clamp(nextZoomRaw, ZOOM_MIN, ZOOM_MAX));
      return;
    }

    const prevZoom = zoomRef.current;
    const nextZoom = clamp(nextZoomRaw, ZOOM_MIN, ZOOM_MAX);
    if (Math.abs(nextZoom - prevZoom) < 0.001) return;

    const rect = el.getBoundingClientRect();
    const mx = rect.width / 2;
    const my = rect.height / 2;

    const scLeft = el.scrollLeft;
    const scTop = el.scrollTop;

    const contentX = (scLeft + mx) / prevZoom;
    const contentY = (scTop + my) / prevZoom;

    setZoom(nextZoom);

    requestAnimationFrame(() => {
      const el2 = scrollRef.current;
      if (!el2) return;
      el2.scrollLeft = contentX * nextZoom - mx;
      el2.scrollTop = contentY * nextZoom - my;
    });
  }

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

  const [editingId, setEditingId] = useState<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  useEffect(() => void (editingIdRef.current = editingId), [editingId]);

  // Touch pointers (for 2-finger panning only — NO pinch zoom)
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());
  const twoFingerRef = useRef<null | { lastCx: number; lastCy: number }>(null);

  const [box, setBox] = useState<null | { x1: number; y1: number; x2: number; y2: number }>(null);
  const dragRef = useRef<DragState | null>(null);

  // 1-finger pan on empty canvas (edit mode)
  const panRef = useRef<null | {
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startScrollLeft: number;
    startScrollTop: number;
  }>(null);

  function clientToBoard(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const z = zoomRef.current || 1;
    return {
      x: (clientX - rect.left) / z,
      y: (clientY - rect.top) / z,
    };
  }

  function getScroll() {
    const el = scrollRef.current;
    return { left: el?.scrollLeft ?? 0, top: el?.scrollTop ?? 0 };
  }

  function rectNorm(x1: number, y1: number, x2: number, y2: number) {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const right = Math.max(x1, x2);
    const bottom = Math.max(y1, y2);
    return { left, top, right, bottom, w: right - left, h: bottom - top };
  }

  function rectIntersects(
    a: { left: number; top: number; right: number; bottom: number },
    b: { left: number; top: number; right: number; bottom: number }
  ) {
    return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
  }

  function clearSelection() {
    selectedIdsRef.current = new Set();
    setSelectedIds(new Set());
    setActiveId(null);
  }

  function selectSingleImmediate(id: string) {
    const s = new Set([id]);
    selectedIdsRef.current = s;
    setSelectedIds(s);
    setActiveId(id);
  }

  function toggleSelectImmediate(id: string) {
    const cur = new Set(selectedIdsRef.current);
    if (cur.has(id)) cur.delete(id);
    else cur.add(id);
    selectedIdsRef.current = cur;
    setSelectedIds(cur);
    setActiveId(id);
  }

  function onDrop(e: React.DragEvent) {
    if (!editMode) return;
    e.preventDefault();
    setIsDragOver(false);

    const { x, y } = clientToBoard(e.clientX, e.clientY);

    const playerJson = e.dataTransfer.getData(playerDragMime);
    if (playerJson) {
      try {
        const p: PlayerPayload = JSON.parse(playerJson);
        const id = `pp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        const next: PlacedPlayer = {
          id,
          x: clamp(x, 0, canvasWidth - DEFAULT_W),
          y: clamp(y, 0, canvasHeight - DEFAULT_H),
          w: DEFAULT_W,
          h: DEFAULT_H,
          player: p,
        };
        onPlacedChangeRef.current([...placedRef.current, next]);
      } catch {}
      return;
    }

    const objJson = e.dataTransfer.getData(objectDragMime);
    if (objJson) {
      try {
        const payload = JSON.parse(objJson) as Partial<BoardObject>;
        const id = `obj_${Date.now()}_${Math.random().toString(16).slice(2)}`;

        const w = Number.isFinite(payload.w) ? (payload.w as number) : 60;
        const h = Number.isFinite(payload.h) ? (payload.h as number) : 60;

        const nextObj: BoardObject = {
          id,
          kind: "token",
          tokenType: payload.tokenType || "circle",
          tokenColor: payload.tokenColor,
          tokenLabel: payload.tokenLabel,
          x: clamp(x, 0, canvasWidth - w),
          y: clamp(y, 0, canvasHeight - h),
          w,
          h,
        };

        const next = [...objectsRef.current, nextObj];
        onObjectsChangeRef.current?.(next);
        selectSingleImmediate(nextObj.id);
      } catch {}
    }
  }

  function beginMoveAny(e: React.PointerEvent, id: string) {
    if (!editMode) return;

    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const isMulti = e.shiftKey || e.metaKey || e.ctrlKey;
    if (isMulti) toggleSelectImmediate(id);
    else selectSingleImmediate(id);

    const selectionNow = new Set(selectedIdsRef.current);
    if (!selectionNow.size) selectionNow.add(id);

    const originPlayers: DragState["originPlayers"] = {};
    const originObjects: DragState["originObjects"] = {};
    const ids = Array.from(selectionNow);

    const placedById = new Map(placedRef.current.map((p) => [p.id, p] as const));
    const objById = new Map(objectsRef.current.map((o) => [o.id, o] as const));

    ids.forEach((pid) => {
      const p = placedById.get(pid);
      if (p) {
        const w = Number.isFinite(p.w) ? (p.w as number) : DEFAULT_W;
        const h = Number.isFinite(p.h) ? (p.h as number) : DEFAULT_H;
        originPlayers[pid] = { x: p.x, y: p.y, w, h };
      }
      const o = objById.get(pid);
      if (o) originObjects[pid] = { x: o.x, y: o.y, w: o.w, h: o.h };
    });

    dragRef.current = {
      pointerId: e.pointerId,
      ids,
      mode: "move",
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      originPlayers,
      originObjects,
    };
  }

  function beginResizeAny(e: React.PointerEvent, id: string) {
    if (!editMode) return;

    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    selectSingleImmediate(id);

    const originPlayers: DragState["originPlayers"] = {};
    const originObjects: DragState["originObjects"] = {};
    const ids = [id];

    const p = placedRef.current.find((pp) => pp.id === id);
    if (p) {
      const w = Number.isFinite(p.w) ? (p.w as number) : DEFAULT_W;
      const h = Number.isFinite(p.h) ? (p.h as number) : DEFAULT_H;
      originPlayers[id] = { x: p.x, y: p.y, w, h };
    }
    const o = objectsRef.current.find((oo) => oo.id === id);
    if (o) originObjects[id] = { x: o.x, y: o.y, w: o.w, h: o.h };

    dragRef.current = {
      pointerId: e.pointerId,
      ids,
      mode: "resize",
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      originPlayers,
      originObjects,
    };
  }

  function onPointerDownCanvas(e: React.PointerEvent) {
    if (e.pointerType === "touch") {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, pointerType: e.pointerType });
    }

    // Edit mode + touch + empty canvas => 1-finger pan
    if (editMode && e.pointerType === "touch" && tool === "select" && e.target === canvasRef.current) {
      clearSelection();
      const sc = getScroll();
      panRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startScrollLeft: sc.left,
        startScrollTop: sc.top,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // View mode panning (mouse/pen)
    if (!editMode) {
      if (e.target !== canvasRef.current) return;
      if (e.pointerType === "touch") return;
      const sc = getScroll();
      panRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startScrollLeft: sc.left,
        startScrollTop: sc.top,
      };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (editingIdRef.current) return;

    if (tool === "lane") {
      e.preventDefault();
      const { x, y } = clientToBoard(e.clientX, e.clientY);

      const id = `obj_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const nextObj: BoardObject = {
        id,
        kind: "lane",
        title: "Lane",
        x: clamp(x, 0, canvasWidth - 420),
        y: clamp(y, 0, canvasHeight - 220),
        w: 420,
        h: 220,
      };
      onObjectsChangeRef.current?.([...objectsRef.current, nextObj]);
      selectSingleImmediate(id);
      return;
    }

    if (tool === "text" || tool === "note") {
      e.preventDefault();
      const { x, y } = clientToBoard(e.clientX, e.clientY);

      const id = `obj_${Date.now()}_${Math.random().toString(16).slice(2)}`;
      const nextObj: BoardObject = {
        id,
        kind: tool,
        x: clamp(x, 0, canvasWidth - 260),
        y: clamp(y, 0, canvasHeight - 140),
        w: 260,
        h: 140,
        text: tool === "note" ? "Note..." : "Text...",
        color: tool === "note" ? "#fff7b2" : undefined,
      };
      onObjectsChangeRef.current?.([...objectsRef.current, nextObj]);
      selectSingleImmediate(id);
      setEditingId(id);
      requestAnimationFrame(() => {
        const el = document.getElementById(`obj-edit-${id}`);
        (el as HTMLElement | null)?.focus();
      });
      return;
    }

    // Mouse box-select only (touch uses pan)
    if (e.pointerType === "touch") return;
    if (e.target !== canvasRef.current) return;

    const { x, y } = clientToBoard(e.clientX, e.clientY);
    if (!(e.shiftKey || e.metaKey || e.ctrlKey)) clearSelection();

    dragRef.current = {
      pointerId: e.pointerId,
      ids: [],
      mode: "box",
      startX: x,
      startY: y,
      moved: false,
      lastClientX: e.clientX,
      lastClientY: e.clientY,
      originPlayers: {},
      originObjects: {},
    };
    setBox({ x1: x, y1: y, x2: x, y2: y });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function updateObject(id: string, patch: Partial<BoardObject>) {
    const next = objectsRef.current.map((o) => (o.id === id ? { ...o, ...patch } : o));
    onObjectsChangeRef.current?.(next);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!editMode) return;
      if (editingIdRef.current) return;
      if (e.key !== "Delete" && e.key !== "Backspace") return;

      const objIds = new Set(objectsRef.current.map((o) => o.id));
      const toDelete = Array.from(selectedIdsRef.current).filter((id) => objIds.has(id));
      if (!toDelete.length) return;

      e.preventDefault();
      const set = new Set(toDelete);
      onObjectsChangeRef.current?.(objectsRef.current.filter((o) => !set.has(o.id)));
      setSelectedIds((cur) => {
        const n = new Set(cur);
        toDelete.forEach((id) => n.delete(id));
        selectedIdsRef.current = n;
        return n;
      });
      setActiveId((cur) => (cur && set.has(cur) ? null : cur));
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [editMode]);

  function onPointerMove(e: React.PointerEvent) {
    if (e.pointerType === "touch") {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY, pointerType: e.pointerType });
    }

    // ✅ Two-finger pan ONLY (no zoom)
    if (e.pointerType === "touch" && !dragRef.current) {
      if (pointersRef.current.size >= 2) {
        const el = scrollRef.current;
        const pts = Array.from(pointersRef.current.values()).slice(0, 2);

        const cx = (pts[0].x + pts[1].x) / 2;
        const cy = (pts[0].y + pts[1].y) / 2;

        if (!twoFingerRef.current) {
          twoFingerRef.current = { lastCx: cx, lastCy: cy };
          return;
        }

        if (el) {
          const last = twoFingerRef.current;
          const dCx = cx - last.lastCx;
          const dCy = cy - last.lastCy;
          el.scrollLeft = el.scrollLeft - dCx;
          el.scrollTop = el.scrollTop - dCy;
        }

        twoFingerRef.current = { lastCx: cx, lastCy: cy };
        return;
      } else {
        twoFingerRef.current = null;
      }
    }

    // 1-finger pan (empty canvas)
    if (panRef.current && panRef.current.pointerId === e.pointerId) {
      const pan = panRef.current;
      const dx = e.clientX - pan.startClientX;
      const dy = e.clientY - pan.startClientY;
      const el = scrollRef.current;
      if (el) {
        el.scrollLeft = pan.startScrollLeft - dx;
        el.scrollTop = pan.startScrollTop - dy;
      }
      return;
    }

    const drag = dragRef.current;
    if (editMode && drag && drag.pointerId === e.pointerId) {
      if (drag.mode === "box") {
        const { x, y } = clientToBoard(e.clientX, e.clientY);
        setBox((cur) => (cur ? { ...cur, x2: x, y2: y } : null));
        return;
      }

      const z = zoomRef.current || 1;
      const dx = (e.clientX - drag.startX) / z;
      const dy = (e.clientY - drag.startY) / z;

      const placedById = new Map(placedRef.current.map((p) => [p.id, p] as const));
      const objById = new Map(objectsRef.current.map((o) => [o.id, o] as const));

      let nextPlaced = placedRef.current.slice();
      let nextObjects = objectsRef.current.slice();

      for (const id of drag.ids) {
        const p = placedById.get(id);
        if (p) {
          const o = drag.originPlayers[id];
          if (!o) continue;

          if (drag.mode === "move") {
            const nx = clamp(o.x + dx, 0, canvasWidth - o.w);
            const ny = clamp(o.y + dy, 0, canvasHeight - o.h);
            nextPlaced = nextPlaced.map((pp) => (pp.id === id ? { ...pp, x: nx, y: ny } : pp));
          } else if (drag.mode === "resize") {
            const nw = clamp(o.w + dx, MIN_W, 900);
            const nh = clamp(o.h + dy, MIN_H, 600);
            nextPlaced = nextPlaced.map((pp) => (pp.id === id ? { ...pp, w: nw, h: nh } : pp));
          }
        }

        const ob = objById.get(id);
        if (ob) {
          const oo = drag.originObjects[id];
          if (!oo) continue;

          if (drag.mode === "move") {
            const nx = clamp(oo.x + dx, 0, canvasWidth - oo.w);
            const ny = clamp(oo.y + dy, 0, canvasHeight - oo.h);
            nextObjects = nextObjects.map((x) => (x.id === id ? { ...x, x: nx, y: ny } : x));
          } else if (drag.mode === "resize") {
            const nw = clamp(oo.w + dx, OBJ_MIN_W, 1400);
            const nh = clamp(oo.h + dy, OBJ_MIN_H, 900);
            nextObjects = nextObjects.map((x) => (x.id === id ? { ...x, w: nw, h: nh } : x));
          }
        }
      }

      onPlacedChangeRef.current(nextPlaced);
      onObjectsChangeRef.current?.(nextObjects);

      drag.lastClientX = e.clientX;
      drag.lastClientY = e.clientY;
      return;
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    if (panRef.current && panRef.current.pointerId === e.pointerId) {
      panRef.current = null;
    }

    const drag = dragRef.current;
    if (editMode && drag && drag.pointerId === e.pointerId) {
      if (drag.mode === "box") {
        const b = box;
        setBox(null);

        if (b) {
          const r = rectNorm(b.x1, b.y1, b.x2, b.y2);
          if (r.w >= 6 || r.h >= 6) {
            const selected = new Set<string>(selectedIdsRef.current);

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

            selectedIdsRef.current = selected;
            setSelectedIds(selected);
            setActiveId(selected.size ? Array.from(selected)[0] : null);
          }
        }
      }
      dragRef.current = null;
    }

    if (e.pointerType === "touch") {
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) twoFingerRef.current = null;
    }
  }

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

  const scaledW = canvasWidth * zoom;
  const scaledH = canvasHeight * zoom;

  const zoomPct = Math.round(zoom * 100);

  return (
    <div
      ref={scrollRef}
      className="w-full h-full min-w-0 min-h-0 overflow-auto bg-white relative"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {/* ✅ Fixed Zoom UI: always bottom-left of visible viewport */}
      <div
        className="fixed left-3 bottom-3 z-[9999]"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onWheel={(e) => e.stopPropagation()}
      >
        {zoomUiCollapsed ? (
          <button
            type="button"
            className="bg-white/95 border rounded-xl shadow px-3 py-2 flex items-center gap-2 hover:bg-gray-50"
            onClick={() => setZoomUiCollapsed(false)}
            title="Show zoom controls"
          >
            <span className="text-sm font-semibold text-gray-800">Zoom</span>
            <span className="text-xs text-gray-600">{zoomPct}%</span>
            <span className="text-gray-700">▴</span>
          </button>
        ) : (
          <div className="bg-white/95 border rounded-xl shadow px-3 py-2 flex items-center gap-2">
            <button
              type="button"
              className="w-9 h-9 rounded-lg border bg-white hover:bg-gray-50 text-lg"
              onClick={() => setZoomCentered(zoomRef.current / 1.1)}
              title="Zoom out"
            >
              −
            </button>

            <div className="flex flex-col">
              <div className="text-xs text-gray-700 font-semibold mb-1 flex items-center justify-between gap-2">
                <span>Zoom: {zoomPct}%</span>
                <button
                  type="button"
                  className="text-gray-600 hover:text-gray-900 px-1"
                  onClick={() => setZoomUiCollapsed(true)}
                  title="Collapse"
                >
                  ▾
                </button>
              </div>
              <input
                type="range"
                min={Math.round(ZOOM_MIN * 100)}
                max={Math.round(ZOOM_MAX * 100)}
                step={5}
                value={zoomPct}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) setZoomCentered(v / 100);
                }}
                style={{ width: 160 }}
              />
            </div>

            <button
              type="button"
              className="w-9 h-9 rounded-lg border bg-white hover:bg-gray-50 text-lg"
              onClick={() => setZoomCentered(zoomRef.current * 1.1)}
              title="Zoom in"
            >
              +
            </button>

            <button
              type="button"
              className="ml-1 text-xs px-2 py-1 rounded border bg-white hover:bg-gray-50"
              onClick={() => setZoomCentered(1)}
              title="Reset zoom"
            >
              100%
            </button>
          </div>
        )}
      </div>

      {/* wrapper defines scrollable area */}
      <div ref={wrapperRef} className="relative" style={{ width: scaledW, height: scaledH }}>
        <div
          ref={canvasRef}
          className="relative"
          style={{
            width: canvasWidth,
            height: canvasHeight,
            ...bgStyle,
            transform: `scale(${zoom})`,
            transformOrigin: "top left",
            touchAction: "none",
          }}
          onDragEnter={(e) => {
            if (!editMode) return;
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragOver={(e) => {
            if (!editMode) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setIsDragOver(true);
          }}
          onDragOverCapture={(e) => {
            if (!editMode) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            setIsDragOver(true);
          }}
          onDragLeave={(e) => {
            if (!editMode) return;
            e.preventDefault();
            setIsDragOver(false);
          }}
          onDrop={(e) => {
            if (!editMode) return;
            onDrop(e);
          }}
          onDropCapture={(e) => {
            if (!editMode) return;
            onDrop(e);
          }}
          onPointerDown={onPointerDownCanvas}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {editMode && isDragOver ? <div className="pointer-events-none absolute inset-0 ring-4 ring-blue-500/35 z-10" /> : null}

          {box
            ? (() => {
                const r = rectNorm(box.x1, box.y1, box.x2, box.y2);
                return (
                  <div
                    className="pointer-events-none absolute z-20 border border-blue-500 bg-blue-200/15"
                    style={{ left: r.left, top: r.top, width: r.w, height: r.h }}
                  />
                );
              })()
            : null}

          {/* NOTE: objects + players rendering stays the same as your current file.
              If you already have your objects + players blocks in this file from previous step,
              keep them below. For brevity, they are omitted here in the comment,
              but you should keep your existing render blocks unchanged. */}

          {/* Objects */}
          {objects.map((o) => {
            const isSelected = selectedIds.has(o.id);
            const isActive = activeId === o.id;
            const isEditing = editingId === o.id;

            if (o.kind === "token") {
              const label = o.tokenLabel || "";
              const isBall = o.tokenType === "ball";
              const fill = o.tokenColor || (isBall ? "transparent" : "#7f1d1d");
              const txtColor = isBall ? "#111827" : isDark(fill) ? "#ffffff" : "#111827";
              const ballPx = clamp(Math.floor(Math.min(o.w, o.h) * 0.9), 18, 220);

              return (
                <div
                  key={o.id}
                  className={`absolute select-none ${isSelected ? "ring-2 ring-blue-500/50" : ""} ${isActive ? "ring-blue-600/70" : ""}`}
                  style={{ left: o.x, top: o.y, width: o.w, height: o.h, zIndex: 1 }}
                  onPointerDown={(e) => beginMoveAny(e, o.id)}
                >
                  <div
                    className="w-full h-full rounded-full flex items-center justify-center"
                    style={{ background: isBall ? "transparent" : fill, border: isBall ? "none" : "1px solid rgba(255,255,255,0.25)" }}
                    title={isBall ? "Ball" : "Token"}
                  >
                    {isBall ? (
                      <span style={{ fontSize: ballPx, lineHeight: 1 }}>⚽</span>
                    ) : (
                      <span className="font-semibold" style={{ color: txtColor, fontSize: 14 }}>
                        {label}
                      </span>
                    )}
                  </div>

                  {editMode && (isSelected || isActive) ? (
                    <div
                      className="absolute rounded bg-white/90 border shadow"
                      style={{ width: RESIZE_HANDLE, height: RESIZE_HANDLE, right: -RESIZE_HANDLE / 2, bottom: -RESIZE_HANDLE / 2, cursor: "nwse-resize" }}
                      onPointerDown={(e) => beginResizeAny(e, o.id)}
                      title="Resize"
                    />
                  ) : null}
                </div>
              );
            }

            if (o.kind === "lane") {
              return (
                <div
                  key={o.id}
                  className={`absolute rounded-xl border bg-white/60 ${isSelected ? "ring-2 ring-blue-500/50" : ""} ${isActive ? "ring-blue-600/70" : ""}`}
                  style={{ left: o.x, top: o.y, width: o.w, height: o.h, zIndex: 1, backdropFilter: "blur(2px)" }}
                  onPointerDown={(e) => beginMoveAny(e, o.id)}
                >
                  <div className="px-3 py-2 text-sm font-semibold text-gray-800 flex items-center justify-between select-none">
                    <div className="min-w-0 truncate">{o.title || ""}</div>
                  </div>
                  {editMode ? (
                    <div
                      className="absolute right-0 bottom-0 rounded-tl bg-black/10"
                      style={{ width: RESIZE_HANDLE, height: RESIZE_HANDLE, cursor: "nwse-resize", touchAction: "none" }}
                      onPointerDown={(e) => beginResizeAny(e, o.id)}
                      title="Resize"
                    />
                  ) : null}
                </div>
              );
            }

            const isNote = o.kind === "note";
            const bg = isNote ? o.color || "#fff7b2" : "transparent";

            return (
              <div
                key={o.id}
                className={`absolute ${isNote ? "rounded-xl border shadow-sm" : ""} ${isSelected ? "ring-2 ring-blue-500/50" : ""} ${isActive ? "ring-blue-600/70" : ""}`}
                style={{ left: o.x, top: o.y, width: o.w, height: o.h, zIndex: 2, background: bg }}
                onPointerDown={(e) => {
                  if (isEditing) return;
                  beginMoveAny(e, o.id);
                }}
              >
                {isEditing ? (
                  <div
                    id={`obj-edit-${o.id}`}
                    contentEditable
                    suppressContentEditableWarning
                    className="w-full h-full outline-none"
                    style={{ whiteSpace: "pre-wrap", overflow: "auto", padding: isNote ? 10 : 6, border: "none", background: "transparent", cursor: "text" }}
                    onPointerDown={(e) => e.stopPropagation()}
                    onBlur={(e) => {
                      const nextText = e.currentTarget.innerText ?? "";
                      updateObject(o.id, { text: nextText });
                      setEditingId(null);
                    }}
                  >
                    {o.text || ""}
                  </div>
                ) : (
                  <div className="w-full h-full text-sm" style={{ whiteSpace: "pre-wrap", overflow: "hidden", padding: isNote ? 10 : 6, pointerEvents: "none" }}>
                    {o.text || ""}
                  </div>
                )}
                {editMode ? (
                  <div
                    className="absolute right-0 bottom-0 rounded-tl bg-black/10"
                    style={{ width: RESIZE_HANDLE, height: RESIZE_HANDLE, cursor: "nwse-resize", touchAction: "none" }}
                    onPointerDown={(e) => beginResizeAny(e, o.id)}
                    title="Resize"
                  />
                ) : null}
              </div>
            );
          })}

          {/* Players */}
          {placed.map((p) => {
            const isSelected = selectedIds.has(p.id);
            const isActive = activeId === p.id;

            const sz = getEffectiveCardSize(cardSizeMode, p);
            const w = sz.w;
            const h = sz.h;

            const gc = gradeColor(p.player.grade);
            const dark = isDark(gc);

            return (
              <div
                key={p.id}
                className={`absolute rounded-2xl border shadow-sm overflow-hidden bg-white select-none ${isSelected ? "ring-2 ring-blue-500/50" : ""} ${isActive ? "ring-blue-600/70" : ""}`}
                style={{ left: p.x, top: p.y, width: w, height: h, zIndex: 5 }}
                onPointerDown={(e) => beginMoveAny(e, p.id)}
              >
                <div className="flex h-full">
                  <div className="flex items-center justify-center" style={{ width: h, background: gc, color: dark ? "#fff" : "#111827" }}>
                    {p.player.pictureUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.player.pictureUrl} alt={p.player.name} className="w-full h-full object-cover" draggable={false} />
                    ) : (
                      <div className="text-xl font-bold">{getInitials(p.player.name)}</div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 px-3 py-2">
                    <div className="font-semibold text-gray-900 truncate">{p.player.name || "Player"}</div>
                    <div className="text-xs text-gray-600 truncate">{buildLine1(p.player)}</div>
                    <div className="text-xs text-gray-600 truncate">{buildLine2(p.player)}</div>
                  </div>
                </div>

                {editMode && (isSelected || isActive) ? (
                  <div
                    className="absolute rounded bg-white/90 border shadow"
                    style={{ width: RESIZE_HANDLE, height: RESIZE_HANDLE, right: -RESIZE_HANDLE / 2, bottom: -RESIZE_HANDLE / 2, cursor: "nwse-resize" }}
                    onPointerDown={(e) => beginResizeAny(e, p.id)}
                    title="Resize"
                  />
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}