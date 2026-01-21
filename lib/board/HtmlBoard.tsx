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
  notes?: string;
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
  return types.includes(dragMime) || types.includes("application/json") || types.includes("text/plain");
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
}: Props) {
  const boardRef = useRef<HTMLDivElement | null>(null);

  // Keep latest values for global listeners
  const placedRef = useRef<PlacedPlayer[]>(placed);
  const onPlacedChangeRef = useRef<(next: PlacedPlayer[]) => void>(onPlacedChange);

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

  // Drag-over highlight
  const [isDragOver, setIsDragOver] = useState(false);
  const dragOverRef = useRef(false);
  function setDragOver(next: boolean) {
    if (dragOverRef.current === next) return;
    dragOverRef.current = next;
    setIsDragOver(next);
  }

  // During a drag of a placed card: do not spam parent state
  const [dragPreview, setDragPreview] = useState<{ id: string; x: number; y: number } | null>(null);

  // Fullscreen player modal
  const [playerModal, setPlayerModal] = useState<{ placedId: string; player: CanvasPlayer } | null>(
    null
  );

  const draggingRef = useRef<{
    id: string;
    pointerId: number;
    dx: number;
    dy: number;
    rafPending: boolean;
    nextX: number;
    nextY: number;
    moved: boolean;
    startClientX: number;
    startClientY: number;
  } | null>(null);

  function clientToBoard(clientX: number, clientY: number) {
    const el = boardRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }

  // ----- Drop from roster onto board -----
  function onDragOver(e: React.DragEvent) {
    if (!editMode) return;
    if (!canAcceptDrag(e, dragMime)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function onDragLeave() {
    setDragOver(false);
  }

  function onDrop(e: React.DragEvent) {
    setDragOver(false);
    if (!editMode) return;
    if (!canAcceptDrag(e, dragMime)) return;

    e.preventDefault();
    const payload = readPayload(e.dataTransfer, dragMime);
    if (!payload) return;

    const pt = clientToBoard(e.clientX, e.clientY);

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
        notes: payload.notes ?? "",
      },
    };

    onPlacedChangeRef.current([...placedRef.current, next]);
  }

  // ----- Move placed cards / click to open modal -----
  function beginMove(e: React.PointerEvent, id: string) {
    if (!editMode) return;

    const card = placedById.get(id);
    if (!card) return;

    // Avoid starting a drag on right-click / secondary button
    if ((e as any).buttons !== undefined && (e as any).buttons !== 1) return;

    const el = e.currentTarget as HTMLDivElement;
    el.setPointerCapture?.(e.pointerId);

    const pt = clientToBoard(e.clientX, e.clientY);

    draggingRef.current = {
      id,
      pointerId: e.pointerId,
      dx: pt.x - card.x,
      dy: pt.y - card.y,
      rafPending: false,
      nextX: card.x,
      nextY: card.y,
      moved: false,
      startClientX: e.clientX,
      startClientY: e.clientY,
    };

    setDragPreview({ id, x: card.x, y: card.y });
  }

  function schedulePreviewUpdate() {
    const d = draggingRef.current;
    if (!d) return;
    if (d.rafPending) return;

    d.rafPending = true;
    requestAnimationFrame(() => {
      const dd = draggingRef.current;
      if (!dd) return;
      dd.rafPending = false;
      setDragPreview({ id: dd.id, x: dd.nextX, y: dd.nextY });
    });
  }

  // Attach global listeners ONCE
  useEffect(() => {
    function onMove(ev: PointerEvent) {
      const d = draggingRef.current;
      if (!d) return;
      if (ev.pointerId !== d.pointerId) return;

      const movedPx = Math.abs(ev.clientX - d.startClientX) + Math.abs(ev.clientY - d.startClientY);
      if (movedPx > 6) d.moved = true;

      const board = boardRef.current;
      const bw = board?.clientWidth ?? Infinity;
      const bh = board?.clientHeight ?? Infinity;

      const currentPlaced = placedRef.current;
      const card = currentPlaced.find((p) => p.id === d.id);

      const w = card?.w ?? DEFAULT_W;
      const h = card?.h ?? DEFAULT_H;

      const pt = clientToBoard(ev.clientX, ev.clientY);
      const x = clamp(pt.x - d.dx, 0, bw - w);
      const y = clamp(pt.y - d.dy, 0, bh - h);

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

      const moved = d.moved;

      draggingRef.current = null;
      setDragPreview(null);

      if (!card) return;

      // If it was a click (not a drag), open modal instead of committing movement
      if (!moved) {
        setPlayerModal({ placedId: card.id, player: card.player });
        return;
      }

      // Commit move ONCE
      const next = currentPlaced.map((p) => (p.id === card.id ? { ...p, x: finalX, y: finalY } : p));
      onPlacedChangeRef.current(next);
    }

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });

    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  const bgStyle: React.CSSProperties = backgroundUrl
    ? { backgroundImage: `url(${backgroundUrl})`, backgroundSize: "cover", backgroundPosition: "center" }
    : {};

  function removePlaced(id: string) {
    const next = placedRef.current.filter((p) => p.id !== id);
    onPlacedChangeRef.current(next);
    setPlayerModal(null);
  }

  return (
    <>
      <div
        ref={boardRef}
        className="w-full h-full relative overflow-hidden bg-white"
        style={bgStyle}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {/* ✅ Removed default grid background — now plain white */}

        {editMode && isDragOver ? (
          <div className="pointer-events-none absolute inset-0 ring-4 ring-blue-500/35 z-10" />
        ) : null}

        {/* placed cards */}
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
                style={{
                  left: x,
                  top: y,
                  width: w,
                  height: h,
                  userSelect: "none",
                }}
                onPointerDown={(e) => beginMove(e, p.id)}
                title="Click to view • Drag to move"
              >
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
              </div>
            );
          })}
        </div>
      </div>

      {/* Fullscreen player modal */}
      {playerModal ? (
        <div
          className="fixed inset-0 z-[999] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setPlayerModal(null)}
        >
          <div
            className="w-full max-w-5xl bg-white rounded-2xl overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="min-w-0">
                <div className="text-lg font-semibold truncate">{playerModal.player.name}</div>
                <div className="text-sm text-gray-600 truncate">{buildLine1(playerModal.player)}</div>
                <div className="text-sm text-gray-600 truncate">{buildLine2(playerModal.player)}</div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="text-sm text-red-600 underline"
                  onClick={() => removePlaced(playerModal.placedId)}
                >
                  Remove from board
                </button>
                <button
                  type="button"
                  className="text-sm underline"
                  onClick={() => setPlayerModal(null)}
                >
                  Close
                </button>
              </div>
            </div>

            <div className="grid gap-0 md:grid-cols-2">
              <div className="bg-black">
                {playerModal.player.pictureUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={playerModal.player.pictureUrl}
                    alt={`${playerModal.player.name} large`}
                    className="w-full h-[60vh] md:h-[70vh] object-contain bg-black"
                  />
                ) : (
                  <div className="w-full h-[60vh] md:h-[70vh] flex items-center justify-center text-white text-6xl font-bold">
                    {getInitials(playerModal.player.name)}
                  </div>
                )}
              </div>

              <div className="p-6">
                <div className="text-sm font-semibold text-gray-900 mb-2">Details</div>
                <div className="space-y-2 text-sm text-gray-800">
                  <div><span className="font-semibold">Grade:</span> {playerModal.player.grade || "—"}</div>
                  <div><span className="font-semibold">Position:</span> {playerModal.player.pos1 || "—"}{playerModal.player.pos2 ? ` / ${playerModal.player.pos2}` : ""}</div>
                  <div><span className="font-semibold">Returning:</span> {playerModal.player.returning || "—"}</div>
                  <div><span className="font-semibold">Primary:</span> {playerModal.player.primary || "—"}</div>
                  <div><span className="font-semibold">Likelihood:</span> {playerModal.player.likelihood || "—"}</div>
                </div>

                <div className="mt-6">
                  <div className="text-sm font-semibold text-gray-900 mb-2">Notes</div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">
                    {playerModal.player.notes?.trim() ? playerModal.player.notes : "—"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
