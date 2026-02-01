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
  type: "lane" | "text" | "note";
  x: number;
  y: number;
  w: number;
  h: number;
  text?: string;
  fill?: string;
  stroke?: string;
  locked?: boolean;
};

type DragMode = "move" | "resize" | "box";

type DragState = {
  pointerId: number;
  mode: DragMode;

  // box select
  startX: number;
  startY: number;

  // move / resize
  ids: string[];
  originPlayers: Record<string, { x: number; y: number; w: number; h: number }>;
  originObjects: Record<string, { x: number; y: number; w: number; h: number }>;

  resizeHandle?: "nw" | "ne" | "sw" | "se";
};

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

function rectIntersects(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number }
) {
  return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
}

export function HtmlBoard(props: {
  tool: BoardTool;
  editMode: boolean;
  placedPlayers: PlacedPlayer[];
  setPlacedPlayers: (next: PlacedPlayer[]) => void;
  objects: BoardObject[];
  setObjects: (next: BoardObject[]) => void;
  deletePlacedCard: (id: string) => void;
  canvasWidth: number;
  canvasHeight: number;
  backgroundUrl?: string;
  setBackgroundUrl?: (url?: string) => void;
  backgroundW?: number;
  setBackgroundW?: (w?: number) => void;
  backgroundH?: number;
  setBackgroundH?: (h?: number) => void;
}) {
  const {
    tool,
    editMode,
    placedPlayers,
    setPlacedPlayers,
    objects,
    setObjects,
    deletePlacedCard,
    canvasWidth,
    canvasHeight,
    backgroundUrl,
    backgroundW,
    backgroundH,
  } = props;

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);

  // Track 2-finger touch pointers
  const pointersRef = useRef<Map<number, { x: number; y: number; pointerType: string }>>(new Map());
  const twoFingerRef = useRef<{ active: boolean; lastCx: number; lastCy: number } | null>(null);

  // Selection box
  const [box, setBox] = useState<null | { x1: number; y1: number; x2: number; y2: number }>(null);

  const dragRef = useRef<DragState | null>(null);

  // View mode: mouse/pen click-drag panning on empty canvas
  const panRef = useRef<null | {
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startScrollLeft: number;
    startScrollTop: number;
  }>(null);

  // ---------- coordinate helpers ----------
  function clientToBoard(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    const sc = scrollRef.current;
    if (!canvas || !sc) return { x: clientX, y: clientY };

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left + sc.scrollLeft;
    const y = clientY - rect.top + sc.scrollTop;
    return { x, y };
  }

  // ---------- create objects ----------
  function uuid() {
    return Math.random().toString(16).slice(2) + "-" + Math.random().toString(16).slice(2);
  }

  function createObject(type: BoardObject["type"], x: number, y: number) {
    const obj: BoardObject = {
      id: uuid(),
      type,
      x: clamp(x, 0, canvasWidth - 200),
      y: clamp(y, 0, canvasHeight - 120),
      w: type === "lane" ? 900 : 300,
      h: type === "lane" ? 260 : 140,
      text: type === "lane" ? "Lane" : type === "note" ? "Note" : "Text",
      fill: type === "note" ? "#fff7cc" : "#ffffff",
      stroke: "#111827",
      locked: false,
    };
    setObjects([...objects, obj]);
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

    // View mode: click-drag empty canvas to pan (mouse/pen). Touch already uses 2-finger.
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

    // In edit mode, non-select tool places objects
    if (editMode && tool !== "select") {
      createObject(tool === "lane" ? "lane" : tool === "note" ? "note" : "text", pt.x, pt.y);
      e.preventDefault();
      return;
    }

    // start box select on desktop/mouse/pen when in select tool
    if (editMode && tool === "select" && e.pointerType !== "touch") {
      dragRef.current = {
        pointerId: e.pointerId,
        mode: "box",
        startX: pt.x,
        startY: pt.y,
        ids: [],
        originPlayers: {},
        originObjects: {},
      };

      setBox({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
      return;
    }
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

    if (d.mode === "box") {
      setBox((cur) => (cur ? { ...cur, x2: pt.x, y2: pt.y } : { x1: d.startX, y1: d.startY, x2: pt.x, y2: pt.y }));
      e.preventDefault();
      return;
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
        return;
      }

      // NOTE: Your full version likely does selection logic elsewhere.
      // This file in your zip only draws the selection box. We leave behavior unchanged.
      return;
    }

    dragRef.current = null;
  }

  // ---------- background ----------
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
    <div className="w-full h-full flex flex-col">
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
              <div className="w-full h-full p-2 text-sm">{o.text ?? ""}</div>
            </div>
          ))}

          {/* placed players */}
          {placedPlayers.map((pp) => (
            <div
              key={pp.id}
              className="absolute rounded-xl border bg-white shadow-sm overflow-hidden"
              style={{
                left: pp.x,
                top: pp.y,
                width: pp.w ?? 180,
                height: pp.h ?? 250,
              }}
            >
              <div className="p-2 text-xs font-semibold truncate">{pp.player.name}</div>

              {/* Your real file likely has full card UI + delete buttons; leaving minimal rendering intact from zip */}
            </div>
          ))}

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
