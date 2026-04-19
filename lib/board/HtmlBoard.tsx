"use client";
import React, { useEffect, useRef, useState, useCallback } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
export type PlayerPayload = {
  id: string; name: string; grade?: string; returning?: string;
  primary?: string; likelihood?: string; pos1?: string; pos2?: string;
  notes?: string; pictureUrl?: string;
};
export type PlacedPlayer = { id: string; x: number; y: number; w?: number; h?: number; player: PlayerPayload; };
export type BoardTool = "pointer" | "select" | "lane" | "text" | "note";
export type BoardObject = {
  id: string; kind: "lane" | "text" | "note";
  x: number; y: number; w: number; h: number;
  title?: string; text?: string; color?: string;
};

// ─── Grade colors ─────────────────────────────────────────────────────────────
function gradeColor(grade?: string): string {
  const g = parseInt((grade ?? "").replace(/[^0-9]/g, ""), 10);
  if (g === 12) return "#7f1630"; // Maroon
  if (g === 11) return "#1a1a1a"; // Black
  if (g === 10) return "#6b7280"; // Grey
  if (g === 9)  return "#e5e7eb"; // White
  return "#1e3a5f";
}
function gradeTextColor(grade?: string): string {
  const g = parseInt((grade ?? "").replace(/[^0-9]/g, ""), 10);
  if (g === 9) return "#111827"; // dark text on white
  return "#ffffff";
}

// ─── ID generator ─────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 10); }

// ─── Props ────────────────────────────────────────────────────────────────────
type Props = {
  editMode: boolean;
  objectsLocked?: boolean;
  placed: PlacedPlayer[];
  onPlacedChange: (next: PlacedPlayer[]) => void;
  playerDragMime: string;
  objectDragMime: string;
  backgroundUrl?: string | null;
  onOpenPlayer?: (id: string) => void;
  canvasWidth?: number;
  canvasHeight?: number;
  objects: BoardObject[];
  onObjectsChange: (next: BoardObject[]) => void;
  tool: BoardTool;
  onToolChange: (t: BoardTool) => void;
  cardSizeMode?: "large" | "medium" | "small";
  onAddPlayerToBoard?: (player: PlayerPayload) => void;
};

// ─── Card size dimensions ──────────────────────────────────────────────────────
const CARD_SIZES = {
  large:  { w: 110, h: 70 },
  medium: { w: 90,  h: 56 },
  small:  { w: 72,  h: 44 },
};

export default function HtmlBoard({
  editMode,
  objectsLocked = false,
  placed,
  onPlacedChange,
  playerDragMime,
  objectDragMime,
  backgroundUrl,
  onOpenPlayer,
  canvasWidth  = 3000,
  canvasHeight = 2000,
  objects,
  onObjectsChange,
  tool,
  onToolChange,
  cardSizeMode = "medium",
  onAddPlayerToBoard,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLDivElement>(null);

  // Pan state
  const [pan, setPan]   = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const panRef = useRef(pan);
  panRef.current = pan;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // Drag state for canvas panning
  const isPanning = useRef(false);
  const panStart  = useRef({ x: 0, y: 0, px: 0, py: 0 });

  // Drag state for moving placed players
  const movingPlayer = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);

  // Drag state for moving board objects
  const movingObj = useRef<{ id: string; startX: number; startY: number; ox: number; oy: number } | null>(null);

  // Resize state for board objects
  const resizingObj = useRef<{ id: string; startX: number; startY: number; ow: number; oh: number } | null>(null);

  // Inline editing for objects
  const [editingObjId, setEditingObjId] = useState<string | null>(null);

  // Selected objects for delete
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const cardSize = CARD_SIZES[cardSizeMode];

  // ─── Coordinate helpers ──────────────────────────────────────────────────────
  function clientToCanvas(clientX: number, clientY: number) {
    const rect = containerRef.current!.getBoundingClientRect();
    return {
      x: (clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (clientY - rect.top  - panRef.current.y) / zoomRef.current,
    };
  }

  // ─── Zoom ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(z => Math.min(3, Math.max(0.2, z * delta)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  // ─── Keyboard delete ──────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!editMode || objectsLocked) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedIds.size > 0) {
        if ((e.target as HTMLElement).tagName === "INPUT" || (e.target as HTMLElement).tagName === "TEXTAREA") return;
        onPlacedChange(placed.filter(p => !selectedIds.has(p.id)));
        onObjectsChange(objects.filter(o => !selectedIds.has(o.id)));
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode, objectsLocked, selectedIds, placed, objects]);

  // ─── Canvas pointer events (pan + place objects) ─────────────────────────────
  function onCanvasPointerDown(e: React.PointerEvent) {
    if (e.button === 2) return;
    const target = e.target as HTMLElement;

    // If clicking directly on canvas background → pan or place object
    if (target === canvasRef.current || target === containerRef.current) {
      if (editMode && !objectsLocked && tool !== "pointer" && tool !== "select") {
        // Place a new object
        const pos = clientToCanvas(e.clientX, e.clientY);
        if (tool === "lane") {
          const obj: BoardObject = { id: uid(), kind: "lane", x: pos.x - 100, y: pos.y - 30, w: 200, h: 60, title: "Lane" };
          onObjectsChange([...objects, obj]);
          onToolChange("pointer");
        } else if (tool === "text") {
          const obj: BoardObject = { id: uid(), kind: "text", x: pos.x - 60, y: pos.y - 15, w: 120, h: 30, text: "Text" };
          onObjectsChange([...objects, obj]);
          onToolChange("pointer");
        } else if (tool === "note") {
          const obj: BoardObject = { id: uid(), kind: "note", x: pos.x - 60, y: pos.y - 40, w: 120, h: 80, text: "Note", color: "#fef08a" };
          onObjectsChange([...objects, obj]);
          onToolChange("pointer");
        }
        return;
      }
      // Pan
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, px: panRef.current.x, py: panRef.current.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    // Clear selection if clicking empty space
    if (tool === "pointer" || !editMode) {
      setSelectedIds(new Set());
    }
  }

  function onCanvasPointerMove(e: React.PointerEvent) {
    if (isPanning.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.px + dx, y: panStart.current.py + dy });
      return;
    }
    if (movingPlayer.current && editMode && !objectsLocked) {
      const pos = clientToCanvas(e.clientX, e.clientY);
      const { id, ox, oy } = movingPlayer.current;
      onPlacedChange(placed.map(p => p.id === id ? { ...p, x: pos.x - ox, y: pos.y - oy } : p));
      return;
    }
    if (movingObj.current && editMode && !objectsLocked) {
      const pos = clientToCanvas(e.clientX, e.clientY);
      const { id, ox, oy } = movingObj.current;
      onObjectsChange(objects.map(o => o.id === id ? { ...o, x: pos.x - ox, y: pos.y - oy } : o));
      return;
    }
    if (resizingObj.current && editMode && !objectsLocked) {
      const pos = clientToCanvas(e.clientX, e.clientY);
      const { id, startX, startY, ow, oh } = resizingObj.current;
      const dw = pos.x - startX;
      const dh = pos.y - startY;
      onObjectsChange(objects.map(o => o.id === id ? { ...o, w: Math.max(60, ow + dw), h: Math.max(30, oh + dh) } : o));
      return;
    }
  }

  function onCanvasPointerUp(e: React.PointerEvent) {
    isPanning.current = false;
    movingPlayer.current = null;
    movingObj.current = null;
    resizingObj.current = null;
  }

  // ─── HTML drag-and-drop for player cards from roster sidebar ──────────────────
  function onCanvasDragOver(e: React.DragEvent) {
    if (!editMode || objectsLocked) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function onCanvasDrop(e: React.DragEvent) {
    if (!editMode || objectsLocked) return;
    e.preventDefault();
    const raw = e.dataTransfer.getData(playerDragMime);
    if (!raw) return;
    const player: PlayerPayload = JSON.parse(raw);
    const pos = clientToCanvas(e.clientX, e.clientY);
    // Check if this player is already placed — if so just move, don't duplicate
    const existing = placed.find(p => p.player.id === player.id);
    if (existing) {
      onPlacedChange(placed.map(p => p.player.id === player.id
        ? { ...p, x: pos.x - cardSize.w / 2, y: pos.y - cardSize.h / 2 }
        : p
      ));
    } else {
      const newPlaced: PlacedPlayer = {
        id: uid(), player,
        x: pos.x - cardSize.w / 2, y: pos.y - cardSize.h / 2,
        w: cardSize.w, h: cardSize.h,
      };
      onPlacedChange([...placed, newPlaced]);
    }
  }

  // ─── Player card pointer drag ──────────────────────────────────────────────────
  function onPlayerPointerDown(e: React.PointerEvent, pp: PlacedPlayer) {
    if (!editMode || objectsLocked) return;
    e.stopPropagation();
    const pos = clientToCanvas(e.clientX, e.clientY);
    movingPlayer.current = { id: pp.id, startX: pos.x, startY: pos.y, ox: pos.x - pp.x, oy: pos.y - pp.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (tool === "select") {
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(pp.id) ? next.delete(pp.id) : next.add(pp.id);
        return next;
      });
    }
  }

  // ─── Object pointer drag ───────────────────────────────────────────────────────
  function onObjPointerDown(e: React.PointerEvent, obj: BoardObject) {
    if (!editMode || objectsLocked) return;
    e.stopPropagation();
    const pos = clientToCanvas(e.clientX, e.clientY);
    movingObj.current = { id: obj.id, startX: pos.x, startY: pos.y, ox: pos.x - obj.x, oy: pos.y - obj.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (tool === "select") {
      setSelectedIds(prev => { const n=new Set(prev); n.has(obj.id)?n.delete(obj.id):n.add(obj.id); return n; });
    }
  }

  function onObjResizePointerDown(e: React.PointerEvent, obj: BoardObject) {
    if (!editMode || objectsLocked) return;
    e.stopPropagation();
    const pos = clientToCanvas(e.clientX, e.clientY);
    resizingObj.current = { id: obj.id, startX: pos.x, startY: pos.y, ow: obj.w, oh: obj.h };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  // ─── Object text editing ───────────────────────────────────────────────────────
  function updateObjText(id: string, text: string) {
    onObjectsChange(objects.map(o => o.id === id ? { ...o, text } : o));
  }
  function updateObjTitle(id: string, title: string) {
    onObjectsChange(objects.map(o => o.id === id ? { ...o, title } : o));
  }
  function deleteObj(id: string) {
    onObjectsChange(objects.filter(o => o.id !== id));
    onPlacedChange(placed.filter(p => p.id !== id));
  }

  // ─── Cursor style ─────────────────────────────────────────────────────────────
  const cursor = !editMode ? "grab"
    : objectsLocked ? "default"
    : tool === "lane" || tool === "text" || tool === "note" ? "crosshair"
    : "grab";

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", cursor, userSelect: "none", touchAction: "none", background: "#1a2332" }}
      onPointerDown={onCanvasPointerDown}
      onPointerMove={onCanvasPointerMove}
      onPointerUp={onCanvasPointerUp}
      onPointerCancel={onCanvasPointerUp}
      onDragOver={onCanvasDragOver}
      onDrop={onCanvasDrop}
    >
      {/* Canvas */}
      <div
        ref={canvasRef}
        style={{
          position: "absolute",
          left: pan.x, top: pan.y,
          width: canvasWidth, height: canvasHeight,
          transform: `scale(${zoom})`,
          transformOrigin: "0 0",
          backgroundImage: backgroundUrl
            ? `url(${backgroundUrl})`
            : "radial-gradient(circle, #2a3f5f 1px, transparent 1px)",
          backgroundSize: backgroundUrl ? "cover" : "40px 40px",
          backgroundPosition: "center",
        }}
      >
        {/* ── Board Objects (lanes, text, notes) ── */}
        {objects.map(obj => {
          const isSelected = selectedIds.has(obj.id);
          const baseStyle: React.CSSProperties = {
            position: "absolute", left: obj.x, top: obj.y, width: obj.w, height: obj.h,
            boxSizing: "border-box",
            outline: isSelected ? "2px solid #3b82f6" : "none",
          };

          if (obj.kind === "lane") return (
            <div key={obj.id} style={{...baseStyle, background:"rgba(255,255,255,0.06)", border:"2px solid rgba(255,255,255,0.25)", borderRadius:8, cursor: editMode&&!objectsLocked?"move":"default"}}
              onPointerDown={e=>onObjPointerDown(e,obj)}
              onDoubleClick={()=>editMode&&!objectsLocked&&setEditingObjId(obj.id)}>
              {editingObjId===obj.id ? (
                <input autoFocus defaultValue={obj.title} onBlur={e=>{updateObjTitle(obj.id,e.target.value);setEditingObjId(null);}} onKeyDown={e=>e.key==="Enter"&&(e.currentTarget.blur())}
                  style={{width:"100%",background:"transparent",border:"none",outline:"none",color:"#fff",fontWeight:700,fontSize:13,textAlign:"center",padding:"4px 8px"}} />
              ) : (
                <div style={{color:"#e2e8f0",fontWeight:700,fontSize:13,padding:"4px 8px",textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {obj.title || "Lane"}
                </div>
              )}
              {editMode&&!objectsLocked&&<button onPointerDown={e=>e.stopPropagation()} onClick={()=>deleteObj(obj.id)} style={{position:"absolute",top:-8,right:-8,width:18,height:18,borderRadius:"50%",background:"#ef4444",border:"none",color:"#fff",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>✕</button>}
              {editMode&&!objectsLocked&&<div onPointerDown={e=>onObjResizePointerDown(e,obj)} style={{position:"absolute",bottom:0,right:0,width:14,height:14,cursor:"se-resize",background:"rgba(255,255,255,0.3)",borderRadius:"2px 0 4px 0"}}/>}
            </div>
          );

          if (obj.kind === "text") return (
            <div key={obj.id} style={{...baseStyle, cursor:editMode&&!objectsLocked?"move":"default"}}
              onPointerDown={e=>onObjPointerDown(e,obj)}
              onDoubleClick={()=>editMode&&!objectsLocked&&setEditingObjId(obj.id)}>
              {editingObjId===obj.id ? (
                <input autoFocus defaultValue={obj.text} onBlur={e=>{updateObjText(obj.id,e.target.value);setEditingObjId(null);}} onKeyDown={e=>e.key==="Enter"&&e.currentTarget.blur()}
                  style={{width:"100%",background:"transparent",border:"none",outline:"none",color:"#fff",fontWeight:700,fontSize:14,padding:0}} />
              ) : (
                <div style={{color:"#ffffff",fontWeight:700,fontSize:14,whiteSpace:"nowrap"}}>{obj.text||"Text"}</div>
              )}
              {editMode&&!objectsLocked&&<button onPointerDown={e=>e.stopPropagation()} onClick={()=>deleteObj(obj.id)} style={{position:"absolute",top:-8,right:-8,width:18,height:18,borderRadius:"50%",background:"#ef4444",border:"none",color:"#fff",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>}
            </div>
          );

          if (obj.kind === "note") return (
            <div key={obj.id} style={{...baseStyle, background:obj.color||"#fef08a", borderRadius:6, padding:6, cursor:editMode&&!objectsLocked?"move":"default"}}
              onPointerDown={e=>onObjPointerDown(e,obj)}
              onDoubleClick={()=>editMode&&!objectsLocked&&setEditingObjId(obj.id)}>
              {editingObjId===obj.id ? (
                <textarea autoFocus defaultValue={obj.text} onBlur={e=>{updateObjText(obj.id,e.target.value);setEditingObjId(null);}}
                  style={{width:"100%",height:"100%",background:"transparent",border:"none",outline:"none",color:"#1a1a1a",fontSize:12,resize:"none",fontFamily:"inherit"}}/>
              ) : (
                <div style={{color:"#1a1a1a",fontSize:12,overflow:"hidden",height:"100%"}}>{obj.text||"Note"}</div>
              )}
              {editMode&&!objectsLocked&&<button onPointerDown={e=>e.stopPropagation()} onClick={()=>deleteObj(obj.id)} style={{position:"absolute",top:-8,right:-8,width:18,height:18,borderRadius:"50%",background:"#ef4444",border:"none",color:"#fff",fontSize:11,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>}
              {editMode&&!objectsLocked&&<div onPointerDown={e=>onObjResizePointerDown(e,obj)} style={{position:"absolute",bottom:0,right:0,width:14,height:14,cursor:"se-resize",background:"rgba(0,0,0,0.15)",borderRadius:"2px 0 4px 0"}}/>}
            </div>
          );
          return null;
        })}

        {/* ── Placed Player Cards ── */}
        {placed.map(pp => {
          const bg = gradeColor(pp.player.grade);
          const fg = gradeTextColor(pp.player.grade);
          const w  = pp.w ?? cardSize.w;
          const h  = pp.h ?? cardSize.h;
          const isSelected = selectedIds.has(pp.id);
          return (
            <div key={pp.id}
              style={{
                position:"absolute", left:pp.x, top:pp.y, width:w, height:h,
                background:bg, borderRadius:8, overflow:"hidden",
                border: isSelected ? "2px solid #60a5fa" : "1.5px solid rgba(255,255,255,0.15)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                cursor: editMode&&!objectsLocked ? "move" : "default",
                display:"flex", flexDirection:"column", userSelect:"none",
                touchAction:"none",
              }}
              onPointerDown={e=>onPlayerPointerDown(e,pp)}
              onDoubleClick={()=>onOpenPlayer?.(pp.id)}
            >
              {/* Position badge */}
              <div style={{position:"absolute",top:3,left:4,fontSize:9,fontWeight:700,color:fg,opacity:0.7,lineHeight:1}}>
                {pp.player.pos1 || pp.player.primary || ""}
              </div>
              {/* Delete button */}
              {editMode&&!objectsLocked&&(
                <button
                  onPointerDown={e=>e.stopPropagation()}
                  onClick={e=>{e.stopPropagation();onPlacedChange(placed.filter(p=>p.id!==pp.id));}}
                  style={{position:"absolute",top:-6,right:-6,width:16,height:16,borderRadius:"50%",background:"#ef4444",border:"none",color:"#fff",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10,lineHeight:1}}>✕</button>
              )}
              {/* Player photo */}
              {pp.player.pictureUrl && (
                <div style={{position:"absolute",right:4,top:4,width:Math.round(h*0.55),height:Math.round(h*0.55),borderRadius:"50%",overflow:"hidden",border:"1.5px solid rgba(255,255,255,0.3)",flexShrink:0}}>
                  <img src={pp.player.pictureUrl} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
                </div>
              )}
              {/* Name */}
              <div style={{position:"absolute",bottom:6,left:4,right:pp.player.pictureUrl?Math.round(h*0.6)+4:4,color:fg,fontWeight:700,fontSize:Math.max(9,Math.round(h/6)),lineHeight:1.2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {pp.player.name}
              </div>
              {/* Grade badge */}
              <div style={{position:"absolute",bottom:3,right:4,fontSize:9,color:fg,opacity:0.6,fontWeight:600}}>
                {pp.player.grade ? "Gr." + pp.player.grade : ""}
              </div>
            </div>
          );
        })}
      </div>

      {/* Zoom indicator */}
      <div style={{position:"absolute",bottom:12,left:12,background:"rgba(0,0,0,0.6)",color:"#94a3b8",fontSize:11,padding:"4px 8px",borderRadius:6,pointerEvents:"none"}}>
        {Math.round(zoom*100)}%
      </div>
    </div>
  );
}
