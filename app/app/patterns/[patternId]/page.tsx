"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import HtmlBoard from "@/lib/board/HtmlBoard";
import type { PlacedPlayer, BoardObject, BoardTool } from "@/lib/board/HtmlBoard";

const MID = "#161b22";
const BORDER = "#30363d";
const MAROON = "#7f1630";
const PATTERN_PLAYER_DRAG_MIME = "application/x-pattern-player";
const PATTERN_OBJECT_DRAG_MIME = "application/x-pattern-object";

type PatternData = {
  placed: PlacedPlayer[];
  objects: BoardObject[];
  startPlaced?: PlacedPlayer[];
  startObjects?: BoardObject[];
};

type Mode = "setup" | "recording" | "playing";

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

  const [placed, setPlaced] = useState<PlacedPlayer[]>([]);
  const [objects, setObjects] = useState<BoardObject[]>([]);
  const [startPlaced, setStartPlaced] = useState<PlacedPlayer[]>([]);
  const [startObjects, setStartObjects] = useState<BoardObject[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [bgSize, setBgSize] = useState<number | undefined>(undefined);
  const [bgLoc, setBgLoc] = useState<{x:number;y:number} | undefined>(undefined);
  const [cardSizeMode, setCardSizeMode] = useState<"medium" | "small" | "large" | "x-small">("medium");
  const [tool, setTool] = useState<BoardTool>("pointer");

  const [mode, setMode] = useState<Mode>("setup");
  const [speed, setSpeed] = useState(1);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [patternId]);

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
      const pl = data.placed ?? [];
      const oj = data.objects ?? [];
      setPlaced(pl);
      setObjects(oj);
      setStartPlaced(data.startPlaced ?? pl);
      setStartObjects(data.startObjects ?? oj);
      setBackgroundUrl((data as any).backgroundUrl ?? null);
      setBgSize((data as any).bgSize);
      setBgLoc((data as any).bgLoc);
      setCardSizeMode((data as any).cardSizeMode ?? "medium");
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    }
    setLoading(false);
  }

  async function save() {
    if (!pattern) return;
    setSaving(true);
    const data: any = { placed, objects, startPlaced, startObjects, backgroundUrl, bgSize, bgLoc, cardSizeMode };
    const res = await fetch(`/api/patterns/${patternId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ data }),
    });
    setSaving(false);
    if (!res.ok) { const e = await res.json().catch(()=>({})); alert(e?.error ?? "Failed to save"); return; }
    setSavedAt(Date.now());
  }

  function startRecording() {
    setStartPlaced(JSON.parse(JSON.stringify(placed)));
    setStartObjects(JSON.parse(JSON.stringify(objects)));
    setMode("recording");
  }

  function stopRecording() { setMode("setup"); }

  function play() {
    if (placed.length === 0 && objects.length === 0) {
      alert("Nothing to play yet. Set up pieces, press Record, move them, then Stop.");
      return;
    }
    const endPlaced = JSON.parse(JSON.stringify(placed));
    const endObjects = JSON.parse(JSON.stringify(objects));
    setMode("playing");
    setPlaced(JSON.parse(JSON.stringify(startPlaced)));
    setObjects(JSON.parse(JSON.stringify(startObjects)));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPlaced(endPlaced);
        setObjects(endObjects);
      });
    });
    const durationMs = Math.round(3000 / speed);
    setTimeout(() => { setMode("setup"); }, durationMs + 200);
  }

  function resetToStart() {
    if (!confirm("Reset to start positions? Your end positions will be lost.")) return;
    setPlaced(JSON.parse(JSON.stringify(startPlaced)));
    setObjects(JSON.parse(JSON.stringify(startObjects)));
  }

  if (loading) return <div style={{padding:24,color:"#94a3b8"}}>Loading…</div>;
  if (error) return <div style={{padding:24,color:"#ff7088"}}>Error: {error}</div>;
  if (!pattern) return <div style={{padding:24,color:"#94a3b8"}}>Pattern not found</div>;

  const durSec = (3 / speed).toFixed(2);

  return (
    <div style={{padding:16,color:"#f1f5f9"}}>
      {mode === "playing" && (
        <style>{`
          [data-pattern-stage] [style*="position: absolute"],
          [data-pattern-stage] [style*="position:absolute"] {
            transition: transform ${durSec}s cubic-bezier(0.4, 0, 0.2, 1),
                        left ${durSec}s cubic-bezier(0.4, 0, 0.2, 1),
                        top ${durSec}s cubic-bezier(0.4, 0, 0.2, 1) !important;
          }
        `}</style>
      )}

      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,fontSize:13,color:"#64748b"}}>
        <Link href={`/app/patterns?teamId=${pattern.team_id}`} style={{color:"#64748b",textDecoration:"none"}}>← Patterns</Link>
        <span style={{color:BORDER}}>|</span>
        <span style={{color:"#f1f5f9",fontWeight:700,fontSize:15}}>{pattern.name}</span>
        <span style={{color:"#94a3b8",fontSize:12}}>· role: {role}</span>
        {savedAt && <span style={{color:"#34d399",fontSize:12}}>· saved {new Date(savedAt).toLocaleTimeString()}</span>}
      </div>

      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:10,background:MID,border:`1px solid ${BORDER}`,borderRadius:10,flexWrap:"wrap"}}>
        {canEdit && mode === "setup" && (<button onClick={startRecording} style={btn(MAROON)}>● Record</button>)}
        {canEdit && mode === "recording" && (<button onClick={stopRecording} style={btn("#dc2626")}>■ Stop Recording</button>)}
        {mode !== "playing" && (<button onClick={play} style={btn("#16a34a")}>▶ Play</button>)}
        {mode === "playing" && (<span style={{color:"#16a34a",fontWeight:700,padding:"6px 12px"}}>▶ Playing…</span>)}
        <div style={{width:1,height:24,background:BORDER}}/>
        <label style={{fontSize:12,color:"#94a3b8"}}>Speed</label>
        <select value={speed} onChange={e => setSpeed(parseFloat(e.target.value))} style={{background:"#0d1117",color:"#f1f5f9",border:`1px solid ${BORDER}`,borderRadius:6,padding:"4px 8px",fontSize:13}}>
          <option value="0.5">0.5x</option>
          <option value="1">1x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
        <div style={{width:1,height:24,background:BORDER}}/>
        {canEdit && mode !== "playing" && (<button onClick={resetToStart} style={btnGhost()}>↺ Reset to Start</button>)}
        {canEdit && (<button onClick={save} disabled={saving || mode === "playing"} style={btn("#0ea5e9")}>{saving ? "Saving…" : "💾 Save"}</button>)}
        <div style={{flex:1}}/>
        <div style={{fontSize:12,color:"#94a3b8"}}>
          {mode === "setup" && "Setup mode — arrange pieces. Press Record then move them to end positions."}
          {mode === "recording" && "● Recording — move pieces to end positions, then Stop."}
          {mode === "playing" && "▶ Playing animation…"}
        </div>
      </div>

      <div ref={stageRef} data-pattern-stage="true" style={{background:MID,border:`1px solid ${BORDER}`,borderRadius:12,overflow:"hidden",position:"relative",height:"calc(100vh - 200px)",minHeight:480}}>
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
          bgLoc={bgLoc}
        />
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
