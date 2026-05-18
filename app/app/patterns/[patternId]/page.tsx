"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import HtmlBoard from "@/lib/board/HtmlBoard";
import type { PlacedPlayer, BoardObject, BoardTool } from "@/lib/board/HtmlBoard";

const DARK = "#0d1117";
const MID = "#161b22";
const BORDER = "#30363d";
const TEXT = "#e6edf3";
const MUTED = "#7d8590";

const PATTERN_PLAYER_DRAG_MIME = "application/x-pattern-player";
const PATTERN_OBJECT_DRAG_MIME = "application/x-pattern-object";

type Mode = "idle" | "recording" | "playing";

type Frame = {
  id: string;
  label: string;
  placed: PlacedPlayer[];
  objects: BoardObject[];
};

function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function cloneFrameState(placed: PlacedPlayer[], objects: BoardObject[]): { placed: PlacedPlayer[]; objects: BoardObject[] } {
  return {
    placed: JSON.parse(JSON.stringify(placed)),
    objects: JSON.parse(JSON.stringify(objects)),
  };
}

export default function PatternDetailPage() {
  const router = useRouter();
  const params = useParams<{ patternId: string }>();
  const patternId = params?.patternId;

  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<string>("");

  const [placed, setPlaced] = useState<PlacedPlayer[]>([]);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [tool, setTool] = useState<BoardTool>("select" as BoardTool);

  const [frames, setFrames] = useState<Frame[]>([]);
  const [currentFrameIdx, setCurrentFrameIdx] = useState<number>(0);

  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [bgSize, setBgSize] = useState<{ w: number; h: number }>({ w: 3000, h: 2000 });
  const [cardSizeMode, setCardSizeMode] = useState<"medium" | "small" | "large" | "x-small">("medium");

  const [mode, setMode] = useState<Mode>("idle");
  const [speed, setSpeed] = useState<number>(1);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const playTimers = useRef<number[]>([]);

  const canEdit = role === "admin" || role === "editor";

  // Load
  useEffect(() => {
    if (!patternId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/patterns/${patternId}`, { cache: "no-store" });
        if (!r.ok) {
          router.push("/app/patterns");
          return;
        }
        const j = await r.json();
        if (cancelled) return;
        const data = j.pattern?.data ?? {};
        setName(j.pattern?.name ?? "");
        setRole(j.role ?? "");
        const pl = data.placed ?? [];
        const oj = data.objects ?? [];
        setPlaced(pl);
        setObjects(oj);
        setBackgroundUrl((data as any).backgroundUrl ?? null);
        const sz = (data as any).bgSize;
        if (sz && typeof sz === "object" && sz.w && sz.h) setBgSize(sz);
        setCardSizeMode((data as any).cardSizeMode ?? "medium");

        // Load frames - migrate from legacy startPlaced/startObjects if needed
        let fs: Frame[] = Array.isArray(data.frames) ? data.frames : [];
        if (fs.length === 0) {
          // Legacy: build a single Start frame from current state, or from startPlaced/startObjects
          const startPlaced = (data as any).startPlaced ?? pl;
          const startObjects = (data as any).startObjects ?? oj;
          fs = [{
            id: newId(),
            label: "Start",
            placed: startPlaced,
            objects: startObjects,
          }];
        }
        setFrames(fs);
        setCurrentFrameIdx(0);
        // Snap to first frame on load
        if (fs[0]) {
          setPlaced(fs[0].placed);
          setObjects(fs[0].objects);
        }
        setLoaded(true);
      } catch (err) {
        console.error("load pattern", err);
        router.push("/app/patterns");
      }
    })();
    return () => { cancelled = true; };
  }, [patternId, router]);

  // Cleanup timers on unmount or mode change
  useEffect(() => {
    return () => {
      playTimers.current.forEach((t) => window.clearTimeout(t));
      playTimers.current = [];
    };
  }, []);

  const stopAnimation = useCallback(() => {
    playTimers.current.forEach((t) => window.clearTimeout(t));
    playTimers.current = [];
    setMode((m) => (m === "playing" ? "idle" : m));
  }, []);

  // Record actions
  function handleRecord() {
    if (!canEdit) return;
    if (mode === "playing") return;
    if (mode === "recording") {
      // Done recording
      setMode("idle");
      return;
    }
    setMode("recording");
    // If no frames, snapshot current as Start
    if (frames.length === 0) {
      const snap = cloneFrameState(placed, objects);
      const f: Frame = { id: newId(), label: "Start", ...snap };
      setFrames([f]);
      setCurrentFrameIdx(0);
    }
  }

  function handleAddFrame() {
    if (mode !== "recording") return;
    const snap = cloneFrameState(placed, objects);
    setFrames((prev) => {
      const next = [...prev, { id: newId(), label: `Step ${prev.length}`, ...snap }];
      setCurrentFrameIdx(next.length - 1);
      return next;
    });
  }

  function handleResetToStart() {
    stopAnimation();
    if (frames.length === 0) return;
    const f = frames[0];
    setPlaced(JSON.parse(JSON.stringify(f.placed)));
    setObjects(JSON.parse(JSON.stringify(f.objects)));
    setCurrentFrameIdx(0);
  }

  function jumpToFrame(idx: number) {
    stopAnimation();
    if (idx < 0 || idx >= frames.length) return;
    const f = frames[idx];
    setPlaced(JSON.parse(JSON.stringify(f.placed)));
    setObjects(JSON.parse(JSON.stringify(f.objects)));
    setCurrentFrameIdx(idx);
  }

  function deleteFrame(idx: number) {
    if (frames.length <= 1) return;
    stopAnimation();
    setFrames((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // re-label generic Step labels
      const renumbered = next.map((f, i) => {
        if (i === 0) return { ...f, label: f.label === "Start" ? "Start" : f.label };
        if (/^Step \d+$/.test(f.label)) return { ...f, label: `Step ${i}` };
        return f;
      });
      const newIdx = Math.min(currentFrameIdx, renumbered.length - 1);
      const target = renumbered[newIdx];
      if (target) {
        setPlaced(JSON.parse(JSON.stringify(target.placed)));
        setObjects(JSON.parse(JSON.stringify(target.objects)));
      }
      setCurrentFrameIdx(newIdx);
      return renumbered;
    });
  }

  function updateFrameFromCurrent(idx: number) {
    if (idx < 0 || idx >= frames.length) return;
    const snap = cloneFrameState(placed, objects);
    setFrames((prev) => prev.map((f, i) => (i === idx ? { ...f, ...snap } : f)));
  }

  function renameFrame(idx: number, newLabel: string) {
    setFrames((prev) => prev.map((f, i) => (i === idx ? { ...f, label: newLabel } : f)));
  }

  function handlePlay(fromIdx: number = 0) {
    stopAnimation();
    if (frames.length < 2) return;
    if (fromIdx < 0 || fromIdx >= frames.length - 1) return;
    setMode("playing");

    // Start by snapping to the fromIdx frame
    const startFrame = frames[fromIdx];
    setPlaced(JSON.parse(JSON.stringify(startFrame.placed)));
    setObjects(JSON.parse(JSON.stringify(startFrame.objects)));
    setCurrentFrameIdx(fromIdx);

    const stepDurationMs = Math.round(2000 / Math.max(speed, 0.1));

    // Schedule transitions to subsequent frames
    for (let i = fromIdx + 1; i < frames.length; i++) {
      const targetIdx = i;
      const delay = (i - fromIdx) * 50; // small delay so React processes the previous setState first
      const t = window.setTimeout(() => {
        const f = frames[targetIdx];
        setPlaced(JSON.parse(JSON.stringify(f.placed)));
        setObjects(JSON.parse(JSON.stringify(f.objects)));
        setCurrentFrameIdx(targetIdx);
      }, (i - fromIdx - 1) * stepDurationMs + 50);
      playTimers.current.push(t);
    }

    // End of animation
    const endT = window.setTimeout(() => {
      setMode("idle");
    }, (frames.length - 1 - fromIdx) * stepDurationMs + 100);
    playTimers.current.push(endT);
  }

  async function handleSave() {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      const data: any = {
        placed,
        objects,
        backgroundUrl,
        bgSize,
        cardSizeMode,
        frames,
      };
      const r = await fetch(`/api/patterns/${patternId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      if (!r.ok) throw new Error("save failed");
    } catch (err) {
      console.error("save pattern", err);
      alert("Failed to save pattern");
    } finally {
      setSaving(false);
    }
  }

  // Inject CSS to animate position changes
  useEffect(() => {
    const styleId = "pattern-stage-animation";
    let el = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = styleId;
      document.head.appendChild(el);
    }
    const transitionMs = Math.round(2000 / Math.max(speed, 0.1));
    el.textContent = mode === "playing"
      ? `[data-pattern-stage="true"] [style*="position: absolute"] { transition: left ${transitionMs}ms ease-in-out, top ${transitionMs}ms ease-in-out !important; }`
      : "";
  }, [mode, speed]);

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", background: DARK, color: TEXT, padding: 24 }}>
        <div style={{ color: MUTED }}>Loadingâ¦</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: DARK, color: TEXT, padding: "12px 16px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
        <button
          onClick={() => router.push("/app/patterns")}
          style={{ background: "transparent", border: "none", color: MUTED, cursor: "pointer", fontSize: 13 }}
        >
          â Patterns
        </button>
        <div style={{ width: 1, height: 18, background: BORDER }} />
        <div style={{ fontSize: 15, fontWeight: 600 }}>{name || "Pattern"}</div>
        <div style={{ fontSize: 12, color: MUTED }}>Â· role: {role}</div>
      </div>

      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 10px",
          background: MID,
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={handleRecord}
          disabled={!canEdit || mode === "playing"}
          style={btn(mode === "recording" ? "#7c2d2d" : "#a13838", !canEdit || mode === "playing")}
        >
          â {mode === "recording" ? "Stop Recording" : "Record"}
        </button>

        {mode === "recording" && (
          <button onClick={handleAddFrame} style={btn("#2563eb")}>
            + Add Frame ({frames.length})
          </button>
        )}

        <button
          onClick={() => handlePlay(0)}
          disabled={mode === "playing" || frames.length < 2}
          style={btn(mode === "playing" ? "#1f6b3a" : "#16a34a", mode === "playing" || frames.length < 2)}
        >
          â¶ Play
        </button>

        {mode === "playing" && (
          <button onClick={stopAnimation} style={btn("#475569")}>
            â  Stop
          </button>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 4 }}>
          <span style={{ fontSize: 12, color: MUTED }}>Speed</span>
          <select
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            style={{
              background: DARK,
              color: TEXT,
              border: `1px solid ${BORDER}`,
              borderRadius: 6,
              padding: "4px 6px",
              fontSize: 12,
            }}
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2x</option>
          </select>
        </div>

        <div style={{ width: 1, height: 22, background: BORDER, margin: "0 4px" }} />

        <button onClick={handleResetToStart} disabled={frames.length === 0} style={btn("#334155", frames.length === 0)}>
          âº Reset to Start
        </button>

        {canEdit && (
          <button onClick={handleSave} disabled={saving} style={btn("#0ea5e9", saving)}>
            {saving ? "Savingâ¦" : "ð¾ Save"}
          </button>
        )}
      </div>

      {/* Body: stage + side panel */}
      <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
        <div
          ref={stageRef}
          data-pattern-stage="true"
          style={{
            flex: 1,
            background: MID,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            overflow: "hidden",
            position: "relative",
            height: "calc(100vh - 180px)",
            minHeight: 480,
          }}
        >
          <HtmlBoard
            editMode={canEdit && mode !== "playing"}
            objectsLocked={mode === "playing"}
            placed={placed}
            onPlacedChange={setPlaced}
            objects={objects}
            onObjectsChange={setObjects}
            tool={tool}
            onToolChange={setTool}
            playerDragMime={PATTERN_PLAYER_DRAG_MIME}
            objectDragMime={PATTERN_OBJECT_DRAG_MIME}
            cardSizeMode={cardSizeMode}
            backgroundUrl={backgroundUrl}
            bgSize={bgSize}
          />
        </div>

        {/* Right side: frame timeline */}
        <div
          style={{
            width: 220,
            background: MID,
            border: `1px solid ${BORDER}`,
            borderRadius: 12,
            padding: 10,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            height: "calc(100vh - 180px)",
            minHeight: 480,
            overflowY: "auto",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Frames</div>
            <div style={{ fontSize: 11, color: MUTED }}>{frames.length}</div>
          </div>

          {frames.length === 0 && (
            <div style={{ fontSize: 12, color: MUTED, padding: "8px 4px" }}>
              No frames yet. Click <strong>â Record</strong> to capture the current state as your Start frame.
            </div>
          )}

          {frames.map((f, i) => {
            const active = i === currentFrameIdx;
            return (
              <div
                key={f.id}
                style={{
                  border: `1px solid ${active ? "#3b82f6" : BORDER}`,
                  background: active ? "#1e293b" : DARK,
                  borderRadius: 8,
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 11, color: MUTED, width: 18 }}>{i + 1}.</div>
                  <input
                    value={f.label}
                    onChange={(e) => renameFrame(i, e.target.value)}
                    disabled={!canEdit}
                    style={{
                      flex: 1,
                      background: "transparent",
                      border: "none",
                      color: TEXT,
                      fontSize: 13,
                      outline: "none",
                      padding: 0,
                    }}
                  />
                </div>
                <div style={{ fontSize: 10, color: MUTED }}>
                  {f.placed.length} players Â· {f.objects.length} objects
                </div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  <button onClick={() => jumpToFrame(i)} style={miniBtn(active ? "#3b82f6" : "#475569")}>
                    {active ? "Current" : "Jump"}
                  </button>
                  {i < frames.length - 1 && (
                    <button
                      onClick={() => handlePlay(i)}
                      disabled={mode === "playing"}
                      style={miniBtn("#16a34a", mode === "playing")}
                    >
                      â¶ From here
                    </button>
                  )}
                  {canEdit && mode === "recording" && (
                    <button onClick={() => updateFrameFromCurrent(i)} style={miniBtn("#a16207")}>
                      Update
                    </button>
                  )}
                  {canEdit && frames.length > 1 && (
                    <button onClick={() => deleteFrame(i)} style={miniBtn("#7f1d1d")}>
                      â
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function btn(bg: string, disabled?: boolean): React.CSSProperties {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  };
}

function miniBtn(bg: string, disabled?: boolean): React.CSSProperties {
  return {
    background: bg,
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "4px 8px",
    fontSize: 11,
    fontWeight: 500,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}
