"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

const DARK = "#0d1117";
const MID = "#161b22";
const BORDER = "#30363d";
const MAROON = "#7f1630";

// We render at this nominal canvas size; container scales via CSS.
const CW = 3000;
const CH = 2000;

type Pos = { x: number; y: number };
type PlayerPayload = { id: string; name: string; pictureUrl?: string; grade?: string };
type PlacedPlayer = { id: string; x: number; y: number; w?: number; h?: number; player: PlayerPayload };
type BoardObject = { id: string; kind: string; x: number; y: number; w?: number; h?: number; label?: string; color?: string };
type PatternData = {
  placed: PlacedPlayer[];
  objects: BoardObject[];
  endPositions: Record<string, Pos>;
  endObjects: Record<string, Pos>;
};

export default function PatternDetailPage() {
  const params = useParams();
  const patternId = params?.patternId as string;
  const router = useRouter();

  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pattern, setPattern] = useState<any>(null);
  const [role, setRole] = useState<string>("viewer");
  const canEdit = role === "admin" || role === "editor";

  // Live state
  const [placed, setPlaced] = useState<PlacedPlayer[]>([]);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [endPositions, setEndPositions] = useState<Record<string, Pos>>({});
  const [endObjects, setEndObjects] = useState<Record<string, Pos>>({});

  // UI mode
  const [mode, setMode] = useState<"setup" | "recording" | "playing">("setup");
  const [speed, setSpeed] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  // For playback: when true, render pieces at their end positions (CSS transitions animate)
  const [showEnd, setShowEnd] = useState(false);

  useEffect(() => { load(); }, [patternId]);

  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data: sess } = await supabase.auth.getSession();
    const tok = sess?.session?.access_token ?? null;
    setAccessToken(tok);

    try {
      const res = await fetch(`/api/patterns/${patternId}`, {
        headers: tok ? { Authorization: `Bearer ${tok}` } : {},
      });
      if (!res.ok) { const d = await res.json().catch(()=>({})); setError(d?.error ?? "Failed to load"); setLoading(false); return; }
      const d = await res.json();
      setPattern(d.pattern);
      setRole(d.role ?? "viewer");
      const data = (d.pattern.data ?? {}) as PatternData;
      setPlaced(data.placed ?? []);
      setObjects(data.objects ?? []);
      setEndPositions(data.endPositions ?? {});
      setEndObjects(data.endObjects ?? {});
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    }
    setLoading(false);
  }

  async function save() {
    if (!pattern) return;
    setSaving(true);
    const data: PatternData = { placed, objects, endPositions, endObjects };
    const res = await fetch(`/api/patterns/${patternId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ data }),
    });
    setSaving(false);
    if (!res.ok) { const e = await res.json().catch(()=>({})); alert(e?.error ?? "Failed to save"); return; }
    setSavedAt(Date.now());
  }

  // Playback control
  function play() {
    if (Object.keys(endPositions).length === 0 && Object.keys(endObjects).length === 0) {
      alert("No movement recorded yet. Press Record, move pieces, then Stop.");
      return;
    }
    setMode("playing");
    // Start at start positions
    setShowEnd(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setShowEnd(true);
      });
    });
    const durationMs = Math.round(3000 / speed);
    setTimeout(() => {
      setMode("setup");
    }, durationMs + 200);
  }

  function startRecording() {
    // Treat current placed positions as the start. Reset endPositions and let user move.
    setEndPositions({});
    setEndObjects({});
    setMode("recording");
  }

  function stopRecording() {
    setMode("setup");
  }

  function resetMovement() {
    if (!confirm("Clear recorded movement? Start positions are kept.")) return;
    setEndPositions({});
    setEndObjects({});
  }

  // Drag handlers — different behavior per mode
  const stageRef = useRef<HTMLDivElement>(null);
  function clientToCanvas(clientX: number, clientY: number): Pos {
    const el = stageRef.current; if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect();
    const x = ((clientX - r.left) / r.width) * CW;
    const y = ((clientY - r.top) / r.height) * CH;
    return { x: Math.max(0, Math.min(CW, x)), y: Math.max(0, Math.min(CH, y)) };
  }

  function onPiecePointerDown(e: React.PointerEvent, pieceKind: "player" | "object", pieceId: string) {
    if (mode === "playing") return;
    if (!canEdit) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
    const move = (ev: PointerEvent) => {
      const p = clientToCanvas(ev.clientX, ev.clientY);
      if (mode === "recording") {
        if (pieceKind === "player") setEndPositions(prev => ({ ...prev, [pieceId]: p }));
        else setEndObjects(prev => ({ ...prev, [pieceId]: p }));
      } else {
        if (pieceKind === "player") setPlaced(prev => prev.map(pl => pl.id === pieceId ? { ...pl, x: p.x, y: p.y } : pl));
        else setObjects(prev => prev.map(o => o.id === pieceId ? { ...o, x: p.x, y: p.y } : o));
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  // Determine the position to render each piece at right now
  function playerRenderPos(p: PlacedPlayer): Pos {
    if (mode === "playing" && showEnd && endPositions[p.id]) return endPositions[p.id];
    if (mode === "recording" && endPositions[p.id]) return endPositions[p.id];
    return { x: p.x, y: p.y };
  }
  function objectRenderPos(o: BoardObject): Pos {
    if (mode === "playing" && showEnd && endObjects[o.id]) return endObjects[o.id];
    if (mode === "recording" && endObjects[o.id]) return endObjects[o.id];
    return { x: o.x, y: o.y };
  }

  const durationSec = (3 / speed).toFixed(2);
  const transitionStyle = mode === "playing"
    ? `transform ${durationSec}s cubic-bezier(0.4, 0, 0.2, 1)`
    : "none";

  // Render path lines (start → end) for pieces that have movement, visible in setup/recording
  const showPaths = mode !== "playing";

  if (loading) return <div style={{padding:24,color:"#94a3b8"}}>Loading…</div>;
  if (error) return <div style={{padding:24,color:"#ff7088"}}>Error: {error}</div>;
  if (!pattern) return <div style={{padding:24,color:"#94a3b8"}}>Pattern not found</div>;

  return (
    <div style={{padding:16,color:"#f1f5f9"}}>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,fontSize:13,color:"#64748b"}}>
        <Link href={`/app/patterns?teamId=${pattern.team_id}`} style={{color:"#64748b",textDecoration:"none"}}>← Patterns</Link>
        <span style={{color:BORDER}}>|</span>
        <span style={{color:"#f1f5f9",fontWeight:700,fontSize:15}}>{pattern.name}</span>
        <span style={{color:"#94a3b8",fontSize:12}}>· role: {role}</span>
        {savedAt && <span style={{color:"#34d399",fontSize:12}}>· saved {new Date(savedAt).toLocaleTimeString()}</span>}
      </div>

      {/* Toolbar */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:10,background:MID,border:`1px solid ${BORDER}`,borderRadius:10,flexWrap:"wrap"}}>
        {canEdit && mode !== "recording" && mode !== "playing" && (
          <button onClick={startRecording} style={btn(MAROON)}>● Record</button>
        )}
        {canEdit && mode === "recording" && (
          <button onClick={stopRecording} style={btn("#dc2626")}>■ Stop Recording</button>
        )}
        {mode !== "playing" && (
          <button onClick={play} style={btn("#16a34a")}>▶ Play</button>
        )}
        {mode === "playing" && (
          <span style={{color:"#16a34a",fontWeight:700,padding:"6px 12px"}}>▶ Playing…</span>
        )}
        <div style={{width:1,height:24,background:BORDER}}/>
        <label style={{fontSize:12,color:"#94a3b8"}}>Speed</label>
        <select value={speed} onChange={e => setSpeed(parseFloat(e.target.value))}
          style={{background:DARK,color:"#f1f5f9",border:`1px solid ${BORDER}`,borderRadius:6,padding:"4px 8px",fontSize:13}}>
          <option value="0.5">0.5x</option>
          <option value="1">1x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
        <div style={{width:1,height:24,background:BORDER}}/>
        {canEdit && (
          <button onClick={resetMovement} style={btnGhost()}>🗑 Clear Movement</button>
        )}
        {canEdit && (
          <button onClick={save} disabled={saving} style={btn("#0ea5e9")}>{saving ? "Saving…" : "💾 Save"}</button>
        )}
        <div style={{flex:1}}/>
        <div style={{fontSize:12,color:"#94a3b8"}}>
          {mode === "setup" && "Setup mode — drag pieces to position. Press Record to capture movement."}
          {mode === "recording" && "Recording — move pieces to set their end positions. Press Stop to finish."}
          {mode === "playing" && "Playing animation…"}
        </div>
      </div>

      {/* Stage */}
      <div style={{background:MID,border:`1px solid ${BORDER}`,borderRadius:12,padding:8,overflow:"hidden"}}>
        <div ref={stageRef} style={{
          position:"relative",
          width:"100%",
          aspectRatio: `${CW} / ${CH}`,
          background:"#0a4d1f",
          backgroundImage:"linear-gradient(0deg, rgba(255,255,255,0.04) 50%, transparent 50%), linear-gradient(0deg, rgba(255,255,255,0.06) 0%, transparent 100%)",
          backgroundSize:"100% 100px, 100% 100%",
          borderRadius:8,
          overflow:"hidden",
          touchAction:"none",
          userSelect:"none",
        }}>
          {/* Field markings */}
          <FieldLines/>

          {/* Movement paths */}
          {showPaths && (
            <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}} viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none">
              {placed.map(p => {
                const e = endPositions[p.id]; if (!e) return null;
                return <line key={p.id} x1={p.x} y1={p.y} x2={e.x} y2={e.y} stroke="rgba(255,255,255,0.6)" strokeWidth="6" strokeDasharray="20 18"/>;
              })}
              {objects.map(o => {
                if (o.kind === "lane" || o.kind === "text" || o.kind === "note") return null;
                const e = endObjects[o.id]; if (!e) return null;
                return <line key={o.id} x1={o.x} y1={o.y} x2={e.x} y2={e.y} stroke="rgba(255,200,80,0.7)" strokeWidth="6" strokeDasharray="20 18"/>;
              })}
            </svg>
          )}

          {/* Static objects: lanes, text, notes */}
          {objects.filter(o => o.kind === "lane" || o.kind === "text" || o.kind === "note").map(o => (
            <StaticObject key={o.id} obj={o}/>
          ))}

          {/* Movable objects: ball, token, cone */}
          {objects.filter(o => o.kind !== "lane" && o.kind !== "text" && o.kind !== "note").map(o => {
            const pos = objectRenderPos(o);
            const xPct = (pos.x / CW) * 100;
            const yPct = (pos.y / CH) * 100;
            return (
              <div key={o.id}
                onPointerDown={e => onPiecePointerDown(e, "object", o.id)}
                style={{
                  position:"absolute",
                  left:`${xPct}%`, top:`${yPct}%`,
                  transform:"translate(-50%, -50%)",
                  transition: transitionStyle === "none" ? "none" : `left ${durationSec}s cubic-bezier(0.4, 0, 0.2, 1), top ${durationSec}s cubic-bezier(0.4, 0, 0.2, 1)`,
                  cursor: mode === "playing" ? "default" : "grab",
                  zIndex: 3,
                }}>
                <ObjectIcon obj={o}/>
              </div>
            );
          })}

          {/* Players */}
          {placed.map(p => {
            const pos = playerRenderPos(p);
            const xPct = (pos.x / CW) * 100;
            const yPct = (pos.y / CH) * 100;
            return (
              <div key={p.id}
                onPointerDown={e => onPiecePointerDown(e, "player", p.id)}
                style={{
                  position:"absolute",
                  left:`${xPct}%`, top:`${yPct}%`,
                  transform:"translate(-50%, -50%)",
                  transition: transitionStyle === "none" ? "none" : `left ${durationSec}s cubic-bezier(0.4, 0, 0.2, 1), top ${durationSec}s cubic-bezier(0.4, 0, 0.2, 1)`,
                  cursor: mode === "playing" ? "default" : "grab",
                  zIndex: 5,
                }}>
                <PlayerToken player={p.player}/>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function btn(bg: string): React.CSSProperties {
  return { background: bg, color: "#fff", border: "none", borderRadius: 8, padding: "8px 14px", fontWeight: 700, fontSize: 13, cursor: "pointer" };
}
function btnGhost(): React.CSSProperties {
  return { background: "transparent", color: "#94a3b8", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 12px", fontSize: 13, cursor: "pointer" };
}

function FieldLines() {
  return (
    <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}} viewBox="0 0 3000 2000" preserveAspectRatio="none">
      <rect x="40" y="40" width="2920" height="1920" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="6"/>
      <line x1="1500" y1="40" x2="1500" y2="1960" stroke="rgba(255,255,255,0.5)" strokeWidth="6"/>
      <circle cx="1500" cy="1000" r="220" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="6"/>
      <circle cx="1500" cy="1000" r="6" fill="rgba(255,255,255,0.5)"/>
      <rect x="40" y="600" width="500" height="800" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="6"/>
      <rect x="2460" y="600" width="500" height="800" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="6"/>
      <rect x="40" y="780" width="200" height="440" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="6"/>
      <rect x="2760" y="780" width="200" height="440" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="6"/>
    </svg>
  );
}

function PlayerToken({ player }: { player: PlayerPayload }) {
  return (
    <div style={{
      width: 110, height: 110,
      background: "#1a1f2e", borderRadius: 12,
      border: "2px solid rgba(255,255,255,0.2)",
      boxShadow: "0 4px 12px rgba(0,0,0,0.6)",
      display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      color: "#fff", padding: 4,
    }}>
      {player.pictureUrl ? (
        <img src={player.pictureUrl} alt="" style={{width:60,height:60,borderRadius:30,objectFit:"cover",marginBottom:2}}/>
      ) : (
        <div style={{width:60,height:60,borderRadius:30,background:gradeBg(player.grade),display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:24,marginBottom:2}}>
          {(player.name?.[0] ?? "?").toUpperCase()}
        </div>
      )}
      <div style={{fontSize:14,fontWeight:700,maxWidth:"100%",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textAlign:"center"}}>
        {player.name}
      </div>
    </div>
  );
}

function gradeBg(grade?: string): string {
  switch (grade) {
    case "9": return "#3b82f6";
    case "10": return "#16a34a";
    case "11": return "#a855f7";
    case "12": return "#ea580c";
    default: return "#475569";
  }
}

function ObjectIcon({ obj }: { obj: BoardObject }) {
  if (obj.kind === "ball") {
    return <div style={{width:60,height:60,borderRadius:30,background:"#fff",border:"3px solid #000",boxShadow:"0 4px 10px rgba(0,0,0,0.6)"}}/>;
  }
  if (obj.kind === "cone") {
    return <div style={{width:50,height:50,background:"#f97316",clipPath:"polygon(50% 0%, 0% 100%, 100% 100%)"}}/>;
  }
  // generic token
  return <div style={{width:60,height:60,borderRadius:8,background:obj.color ?? "#fbbf24",border:"2px solid #fff",display:"flex",alignItems:"center",justifyContent:"center",color:"#000",fontWeight:700}}>{obj.label ?? ""}</div>;
}

function StaticObject({ obj }: { obj: BoardObject }) {
  const xPct = (obj.x / CW) * 100;
  const yPct = (obj.y / CH) * 100;
  const wPct = obj.w ? (obj.w / CW) * 100 : 10;
  const hPct = obj.h ? (obj.h / CH) * 100 : 5;
  if (obj.kind === "lane") {
    return <div style={{position:"absolute",left:`${xPct}%`,top:`${yPct}%`,width:`${wPct}%`,height:`${hPct}%`,background:"rgba(96,165,250,0.18)",border:"2px dashed rgba(96,165,250,0.5)",borderRadius:6,zIndex:1,pointerEvents:"none"}}/>;
  }
  if (obj.kind === "text") {
    return <div style={{position:"absolute",left:`${xPct}%`,top:`${yPct}%`,transform:"translate(-50%, -50%)",color:"#fff",fontWeight:700,fontSize:18,textShadow:"0 0 4px rgba(0,0,0,0.8)",zIndex:2,pointerEvents:"none"}}>{obj.label}</div>;
  }
  if (obj.kind === "note") {
    return <div style={{position:"absolute",left:`${xPct}%`,top:`${yPct}%`,background:"#fef3c7",color:"#78350f",padding:"6px 10px",borderRadius:6,fontSize:13,maxWidth:"22%",zIndex:2,pointerEvents:"none"}}>{obj.label}</div>;
  }
  return null;
}
