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
};

const LARGE_CARD = { w: 280, h: 120 };
const MEDIUM_CARD = { w: 200, h: 110 };
const SMALL_CARD = { w: 130, h: 60 };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isDark(hex: string) {
  const v = hex.replace("#", "");
  if (v.length !== 6) return false;
  const r = parseInt(v.slice(0, 2), 16);
  const g = parseInt(v.slice(2, 4), 16);
  const b = parseInt(v.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.6;
}

function gradeColor(g?: string) {
  const v = (g || "").trim().toLowerCase();
  if (!v) return "#d1d5db"; // gray-300
  if (v.includes("9")) return "#60a5fa"; // blue-400
  if (v.includes("10")) return "#34d399"; // green-400
  if (v.includes("11")) return "#fbbf24"; // amber-400
  if (v.includes("12")) return "#f87171"; // red-400
  return "#a78bfa"; // purple-400
}

function getInitials(name: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
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

function clientToBoard(clientX: number, clientY: number, canvasEl: HTMLDivElement, scale: number) {
  const rect = canvasEl.getBoundingClientRect();
  const x = (clientX - rect.left) / scale;
  const y = (clientY - rect.top) / scale;
  return { x, y };
}

function getEffectiveCardSize(mode: "large" | "medium" | "small", p: PlacedPlayer) {
  if (p.w && p.h) return { w: p.w, h: p.h };
  if (mode === "small") return SMALL_CARD;
  if (mode === "medium") return MEDIUM_CARD;
  return LARGE_CARD;
}

type DragPayload = PlayerPayload & { __dragType?: string };

export function HtmlBoard({
  editMode,
  placed,
  onPlacedChange,
  dragMime,
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

  // selection/active
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dragState, setDragState] = useState<any>(null);

  // zoom
  const [scale, setScale] = useState(1);

  const bgStyle = useMemo(() => {
    if (!backgroundUrl) return {};
    return {
      backgroundImage: `url(${backgroundUrl})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    } as React.CSSProperties;
  }, [backgroundUrl]);

  function ensureSelectionOnPointerDown(id: string, e: React.PointerEvent) {
    // If already selected, keep multi-selection; otherwise set to just this.
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (!next.has(id)) {
        next.clear();
        next.add(id);
      }
      return next;
    });

    setActiveId(id);
  }

  function beginMoveAny(e: React.PointerEvent, id: string) {
    if (!editMode) return;

    e.preventDefault();
    e.stopPropagation();

    ensureSelectionOnPointerDown(id, e);

    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const pt = clientToBoard(e.clientX, e.clientY, canvasEl, scale);

    const selected = new Set(selectedIds);
    if (!selected.has(id)) {
      selected.clear();
      selected.add(id);
    }

    const originPlayers: Record<string, any> = {};
    placedRef.current.forEach((p) => {
      if (selected.has(p.id)) originPlayers[p.id] = { x: p.x, y: p.y, w: p.w, h: p.h };
    });

    const originObjects: Record<string, any> = {};
    objectsRef.current.forEach((o) => {
      if (selected.has(o.id)) originObjects[o.id] = { x: o.x, y: o.y };
    });

    (e.currentTarget as any).setPointerCapture?.(e.pointerId);

    setDragState({
      kind: "move",
      start: pt,
      selected,
      originPlayers,
      originObjects,
    });
  }

  function onCanvasPointerDown(e: React.PointerEvent) {
    if (!editMode) {
      // allow deselect in view mode
      setSelectedIds(new Set());
      setActiveId(null);
      return;
    }

    // tools: lane/text/note create objects
    if (tool !== "select") {
      e.preventDefault();
      e.stopPropagation();
      const canvasEl = canvasRef.current;
      if (!canvasEl) return;

      const pt = clientToBoard(e.clientX, e.clientY, canvasEl, scale);
      const id = `obj-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const base: BoardObject = {
        id,
        kind: tool,
        x: clamp(pt.x - 100, 0, canvasWidth - 200),
        y: clamp(pt.y - 40, 0, canvasHeight - 120),
        w: tool === "lane" ? 600 : 240,
        h: tool === "lane" ? 140 : 160,
        title: tool === "lane" ? "Lane" : undefined,
        text: tool === "text" ? "Text" : tool === "note" ? "Note" : undefined,
        color: tool === "note" ? "#fef3c7" : undefined,
      };

      onObjectsChange?.([...(objectsRef.current || []), base]);

      // return to select after drop
      onToolChange?.("select");
      return;
    }

    // selection on empty canvas
    setSelectedIds(new Set());
    setActiveId(null);
  }

  function onCanvasPointerMove(e: React.PointerEvent) {
    if (!editMode) return;
    if (!dragState) return;

    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const pt = clientToBoard(e.clientX, e.clientY, canvasEl, scale);
    const dx = pt.x - dragState.start.x;
    const dy = pt.y - dragState.start.y;

    if (dragState.kind === "move") {
      const sel: Set<string> = dragState.selected;
      // players
      const nextPlaced = placedRef.current.map((p) => {
        if (!sel.has(p.id)) return p;
        const o = dragState.originPlayers[p.id];
        if (!o) return p;

        const w = p.w ?? getEffectiveCardSize(cardSizeMode, p).w;
        const h = p.h ?? getEffectiveCardSize(cardSizeMode, p).h;

        const x = clamp(o.x + dx, 0, canvasWidth - w);
        const y = clamp(o.y + dy, 0, canvasHeight - h);

        if (cardSizeMode === "large") {
          return { ...p, x, y, w, h };
        }
        return { ...p, x, y };
      });

      // objects
      const nextObjects = objectsRef.current.map((o) => {
        const oo = dragState.originObjects[o.id];
        if (!oo) return o;

        const x = clamp(oo.x + dx, 0, canvasWidth - o.w);
        const y = clamp(oo.y + dy, 0, canvasHeight - o.h);
        return { ...o, x, y };
      });

      onPlacedChange(nextPlaced);
      onObjectsChange?.(nextObjects);
    }
  }

  function onCanvasPointerUp(e: React.PointerEvent) {
    if (!editMode) return;
    if (!dragState) return;

    e.preventDefault();
    e.stopPropagation();
    setDragState(null);
  }

  function onDrop(e: React.DragEvent) {
    if (!editMode) return;

    e.preventDefault();
    e.stopPropagation();

    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const txt = e.dataTransfer.getData(dragMime) || e.dataTransfer.getData("application/json");
    if (!txt) return;

    let payload: DragPayload | null = null;
    try {
      payload = JSON.parse(txt);
    } catch {
      payload = null;
    }
    if (!payload) return;

    const pt = clientToBoard(e.clientX, e.clientY, canvasEl, scale);
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
        w: cardSizeMode === "large" ? w : undefined,
        h: cardSizeMode === "large" ? h : undefined,
        player: {
          id: payload.id,
          name: payload.name,
          grade: payload.grade,
          returning: payload.returning,
          primary: payload.primary,
          likelihood: payload.likelihood,
          pos1: payload.pos1,
          pos2: payload.pos2,
          notes: payload.notes,
          pictureUrl: payload.pictureUrl,
        },
      },
    ];

    onPlacedChange(next);
  }

  function onDragOver(e: React.DragEvent) {
    if (!editMode) return;
    e.preventDefault();
  }

  function zoomIn() {
    setScale((s) => clamp(Number((s + 0.1).toFixed(2)), 0.5, 2));
  }
  function zoomOut() {
    setScale((s) => clamp(Number((s - 0.1).toFixed(2)), 0.5, 2));
  }
  function resetZoom() {
    setScale(1);
  }

  return (
    <div className="w-full h-[calc(100vh-120px)] flex flex-col">
      <div className="flex items-center gap-2 p-2 border-b bg-white">
        <button className="text-sm border rounded px-2 py-1" onClick={zoomOut} title="Zoom out">
          −
        </button>
        <button className="text-sm border rounded px-2 py-1" onClick={resetZoom} title="Reset zoom">
          100%
        </button>
        <button className="text-sm border rounded px-2 py-1" onClick={zoomIn} title="Zoom in">
          +
        </button>
        <div className="text-xs text-gray-500 ml-2">Zoom: {Math.round(scale * 100)}%</div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto bg-gray-50">
        <div
          ref={canvasRef}
          className="relative m-6 border rounded-lg bg-white shadow-sm overflow-hidden"
          style={{
            width: canvasWidth * scale,
            height: canvasHeight * scale,
            transformOrigin: "top left",
            transform: `scale(${scale})`,
            ...bgStyle,
          }}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          {/* lanes/text/notes */}
          {objects.map((o) => {
            if (o.kind === "lane") {
              return (
                <div
                  key={o.id}
                  className="absolute border-2 border-dashed rounded-lg bg-white/60"
                  style={{ left: o.x, top: o.y, width: o.w, height: o.h }}
                  onPointerDown={(e) => beginMoveAny(e, o.id)}
                >
                  <div className="text-xs font-semibold p-2">{o.title || "Lane"}</div>
                </div>
              );
            }
            if (o.kind === "text") {
              return (
                <div
                  key={o.id}
                  className="absolute border rounded-lg bg-white p-2 text-sm"
                  style={{ left: o.x, top: o.y, width: o.w, height: o.h }}
                  onPointerDown={(e) => beginMoveAny(e, o.id)}
                >
                  <div className="whitespace-pre-wrap">{o.text || ""}</div>
                </div>
              );
            }
            // note
            return (
              <div
                key={o.id}
                className="absolute border rounded-lg p-2 text-sm"
                style={{ left: o.x, top: o.y, width: o.w, height: o.h, background: o.color || "#fef3c7" }}
                onPointerDown={(e) => beginMoveAny(e, o.id)}
              >
                <div className="whitespace-pre-wrap">{o.text || ""}</div>
              </div>
            );
          })}

          {/* placed player cards */}
          {placed.map((p) => {
            const effSize = getEffectiveCardSize(cardSizeMode, p);
            const w = effSize.w;
            const h = effSize.h;

            const showPhoto = cardSizeMode !== "small";
            const showGrade = cardSizeMode !== "small";
            const showNotes = cardSizeMode === "large";

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
                {/* grade bar */}
                <div className="absolute left-0 top-0 w-full rounded-t-xl" style={{ height: 6, background: gCol }} />

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

                    {showGrade ? (
                      <div className="text-[12px] text-gray-700 mt-1 overflow-hidden whitespace-nowrap text-ellipsis">
                        Grade: {p.player.grade || "?"}
                      </div>
                    ) : null}

                    {showNotes ? (
                      <div
                        className="text-[12px] text-gray-700 mt-1 overflow-hidden whitespace-nowrap text-ellipsis"
                        title={p.player.notes || ""}
                      >
                        {p.player.notes ? `Notes: ${p.player.notes}` : "Notes: —"}
                      </div>
                    ) : null}
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