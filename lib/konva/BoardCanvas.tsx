"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Group, Rect, Text, Image as KonvaImage } from "react-konva";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import { useImage } from "./useImage";

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
  onBackgroundUrlChange?: (url: string) => void;

  dragMime?: string;
};

const DEFAULT_W = 280;
const DEFAULT_H = 96;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function BoardCanvas({
  editMode,
  placed,
  onPlacedChange,
  backgroundUrl,
  onBackgroundUrlChange, // intentionally unused here
  dragMime = "application/x-soccerboard-player",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<KonvaStage | null>(null);

  const [size, setSize] = useState({ w: 800, h: 600 });

  // View transform
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  // Spacebar pan mode
  const [spaceDown, setSpaceDown] = useState(false);

  // Drag/drop UI state (guarded)
  const [isDragOver, setIsDragOver] = useState(false);
  const isDragOverRef = useRef(false);

  // Background image
  const { image: bgImage } = useImage(backgroundUrl);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({
        w: Math.max(200, Math.floor(r.width)),
        h: Math.max(200, Math.floor(r.height)),
      });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  const stageDraggable = useMemo(() => spaceDown, [spaceDown]);

  function clientToWorld(clientX: number, clientY: number) {
    const container = containerRef.current;
    if (!container) return { x: 0, y: 0 };

    const rect = container.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    return {
      x: (px - offset.x) / scale,
      y: (py - offset.y) / scale,
    };
  }

  function onWheel(e: any) {
    e.evt.preventDefault();

    const stage = stageRef.current;
    if (!stage) return;

    const oldScale = scale;
    const pointer = stage.getPointerPosition?.();
    if (!pointer) return;

    const mousePointTo = {
      x: (pointer.x - offset.x) / oldScale,
      y: (pointer.y - offset.y) / oldScale,
    };

    const direction = e.evt.deltaY > 0 ? -1 : 1;
    const factor = 1.06;
    const newScale = clamp(direction > 0 ? oldScale * factor : oldScale / factor, 0.3, 3);

    const newPos = {
      x: pointer.x - mousePointTo.x * newScale,
      y: pointer.y - mousePointTo.y * newScale,
    };

    setScale(newScale);
    setOffset(newPos);
  }

  function canAcceptDrag(e: React.DragEvent) {
    const types = Array.from(e.dataTransfer.types || []);
    return (
      types.includes(dragMime) ||
      types.includes("application/json") ||
      types.includes("text/plain")
    );
  }

  function setDragOver(next: boolean) {
    if (isDragOverRef.current === next) return;
    isDragOverRef.current = next;
    setIsDragOver(next);
  }

  function onDragOverCapture(e: React.DragEvent) {
    if (!editMode) return;
    if (!canAcceptDrag(e)) return;

    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function onDragLeaveCapture() {
    setDragOver(false);
  }

  function readPayload(dt: DataTransfer): any | null {
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

  function onDropCapture(e: React.DragEvent) {
    setDragOver(false);
    if (!editMode) return;
    if (!canAcceptDrag(e)) return;

    e.preventDefault();

    const payload = readPayload(e.dataTransfer);
    if (!payload) return;

    const world = clientToWorld(e.clientX, e.clientY);

    const newItem: PlacedPlayer = {
      id: `${payload.id || "p"}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      x: world.x,
      y: world.y,
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

    onPlacedChange([...placed, newItem]);
  }

  function updatePlacedOnEnd(id: string, x: number, y: number) {
    onPlacedChange(placed.map((p) => (p.id === id ? { ...p, x, y } : p)));
  }

  return (
    <div className="w-full h-full relative">
      {editMode && isDragOver ? (
        <div className="pointer-events-none absolute inset-0 z-10 ring-4 ring-blue-500/40" />
      ) : null}

      <div
        ref={containerRef}
        className="w-full h-full overflow-hidden"
        onDragOverCapture={onDragOverCapture}
        onDragLeaveCapture={onDragLeaveCapture}
        onDropCapture={onDropCapture}
      >
        <Stage
          ref={(n) => {
            stageRef.current = n;
          }}
          width={size.w}
          height={size.h}
          onWheel={onWheel}
          draggable={stageDraggable}
          x={offset.x}
          y={offset.y}
          scaleX={scale}
          scaleY={scale}
          onDragEnd={(e) => {
            // only relevant when space-panning the whole stage
            if (!spaceDown) return;
            setOffset({ x: e.target.x(), y: e.target.y() });
          }}
        >
          <Layer>
            {bgImage ? (
              <KonvaImage image={bgImage} x={0} y={0} opacity={0.25} listening={false} />
            ) : null}

            {placed.map((p) => (
              <PlayerCardNode
                key={p.id}
                item={p}
                editable={editMode}
                // ✅ only commit at end (prevents render storm/freezes)
                onDragEnd={(x, y) => updatePlacedOnEnd(p.id, x, y)}
              />
            ))}
          </Layer>
        </Stage>
      </div>
    </div>
  );
}

function PlayerCardNode({
  item,
  editable,
  onDragEnd,
}: {
  item: PlacedPlayer;
  editable: boolean;
  onDragEnd: (x: number, y: number) => void;
}) {
  const { image } = useImage(item.player.pictureUrl);

  const w = Number.isFinite(item.w) ? item.w : DEFAULT_W;
  const h = Number.isFinite(item.h) ? item.h : DEFAULT_H;

  const name = item.player.name || "Player";
  const line1 = `${item.player.grade ? `Grade: ${item.player.grade}` : "Grade: ?"} • ${
    item.player.pos1 ? `Pos: ${item.player.pos1}${item.player.pos2 ? ` / ${item.player.pos2}` : ""}` : "Pos: ?"
  } • ${item.player.returning ? `Returning: ${item.player.returning}` : "Returning: ?"}`;

  const line2 = `${item.player.primary ? `Primary: ${item.player.primary}` : "Primary: ?"} • ${
    item.player.likelihood ? `Likelihood: ${item.player.likelihood}` : "Likelihood: ?"
  }`;

  return (
    <Group
      x={item.x}
      y={item.y}
      draggable={editable}
      // ✅ do NOT update React state on every drag move
      onDragEnd={(e) => {
        onDragEnd(e.target.x(), e.target.y());
      }}
    >
      <Rect
        width={w}
        height={h}
        fill="white"
        stroke="rgba(0,0,0,0.18)"
        cornerRadius={12}
        shadowBlur={4}
        shadowOpacity={0.1}
      />

      <Group>
        <Rect x={0} y={0} width={88} height={h} fill="#f3f4f6" stroke="rgba(0,0,0,0.06)" />
        {image ? (
          <KonvaImage image={image} x={0} y={0} width={88} height={h} />
        ) : (
          <Text
            x={0}
            y={Math.max(0, (h - 18) / 2)}
            width={88}
            align="center"
            text={getInitials(name)}
            fontSize={18}
            fill="#111827"
            fontStyle="bold"
          />
        )}
      </Group>

      <Group x={98} y={10}>
        <Text
          text={name}
          width={Math.max(60, w - 108)}
          fontSize={14}
          fill="#111827"
          fontStyle="bold"
          wrap="word"
        />
        <Text y={22} text={line1} width={Math.max(60, w - 108)} fontSize={12} fill="#374151" wrap="word" />
        <Text y={44} text={line2} width={Math.max(60, w - 108)} fontSize={12} fill="#374151" wrap="word" />
      </Group>
    </Group>
  );
}

function getInitials(name?: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : "";
  const out = `${first}${last}`.toUpperCase();
  return out || "?";
}
