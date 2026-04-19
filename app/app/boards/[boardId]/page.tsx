"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import HtmlBoard from "@/lib/board/HtmlBoard";
import type { PlacedPlayer, BoardObject, BoardTool, PlayerPayload } from "@/lib/board/HtmlBoard";

const PLAYER_DRAG_MIME = "application/x-lp-player";
const OBJECT_DRAG_MIME = "application/x-lp-object";
const BG_BUCKET        = "board-backgrounds";

type BoardRow = { id: string; name: string; team_id: string; data: any; };
type PlayerRow = {
  id: string; name: string; grade: string; position: string;
  secondaryPosition: string; returning: string; likelihoodPrimary: string;
  potentialPrimary: string; notes: string; picture: string;
  pictureProxyUrl?: string;
};
type GoogleConfig = { sheetId: string; range: string; };

function gradeColor(grade?: string) {
  const g = parseInt((grade ?? "").replace(/[^0-9]/g,""), 10);
  if (g===12) return "#7f1630";
  if (g===11) return "#1a1a1a";
  if (g===10) return "#6b7280";
  if (g===9)  return "#e5e7eb";
  return "#1e3a5f";
}
function gradeText(grade?: string) {
  const g = parseInt((grade ?? "").replace(/[^0-9]/g,""), 10);
  return g===9 ? "#111827" : "#ffffff";
}

export default function BoardPage() {
  const params    = useParams();
  const router    = useRouter();
  const boardId   = Array.isArray(params.boardId) ? params.boardId[0] : (params.boardId ?? "");

  // Board state
  const [board,          setBoard]          = useState<BoardRow|null>(null);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string|null>(null);
  const [myRole,         setMyRole]         = useState("viewer");
  const [editMode,       setEditMode]       = useState(false);
  const [objectsLocked,  setObjectsLocked]  = useState(false);
  const [dirty,          setDirty]          = useState(false);
  const [saving,         setSaving]         = useState(false);

  // Board data
  const [placedPlayers,  setPlacedPlayers]  = useState<PlacedPlayer[]>([]);
  const [boardObjects,   setBoardObjects]   = useState<BoardObject[]>([]);
  const [backgroundUrl,  setBackgroundUrl]  = useState<string|null>(null);
  const [cardSizeMode,   setCardSizeMode]   = useState<"large"|"medium"|"small">("medium");
  const [tool,           setTool]           = useState<BoardTool>("pointer");

  // Roster
  const [googleConfig,   setGoogleConfig]   = useState<GoogleConfig|null>(null);
  const [players,        setPlayers]        = useState<PlayerRow[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playersError,   setPlayersError]   = useState("");
  const [sidebarOpen,    setSidebarOpen]    = useState(true);
  const [searchQuery,    setSearchQuery]    = useState("");
  const [gradeFilter,    setGradeFilter]    = useState<string>("all");

  // Sheet config editing
  const [showSheetEdit,  setShowSheetEdit]  = useState(false);
  const [sheetIdInput,   setSheetIdInput]   = useState("");
  const [sheetRangeInput,setSheetRangeInput]= useState("Sheet1!A:I");

  const bgInputRef = useRef<HTMLInputElement>(null);

  // ── Load board ──────────────────────────────────────────────────────────────
  useEffect(() => { if (boardId) loadBoard(); }, [boardId]);

  async function loadBoard() {
    setLoading(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.push("/login"); return; }

    const res = await fetch(`/api/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      setError(json?.error ?? "Failed to load board");
      setLoading(false);
      return;
    }

    const row: BoardRow = json.board;
    const role: string  = json.role ?? "viewer";
    setMyRole(role);
    setEditMode(role === "admin" || role === "editor");
    setBoard(row);

    const hb = row?.data?.htmlBoard ?? {};
    setPlacedPlayers(hb.placed      ?? []);
    setBoardObjects (hb.objects     ?? []);
    setBackgroundUrl(hb.backgroundUrl ?? null);
    setCardSizeMode (hb.cardSizeMode  ?? "medium");

    const gc = row?.data?.googleConfig;
    if (gc?.sheetId && gc?.range) {
      setGoogleConfig({ sheetId: gc.sheetId, range: gc.range });
    }
    setLoading(false);
  }

  // ── Load players from Google Sheet ──────────────────────────────────────────
  useEffect(() => { if (googleConfig) loadPlayers(); }, [googleConfig]);

  async function loadPlayers() {
    if (!googleConfig) return;
    setPlayersLoading(true);
    setPlayersError("");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const res = await fetch(
        `/api/google/sheet?sheetId=${encodeURIComponent(googleConfig.sheetId)}&range=${encodeURIComponent(googleConfig.range)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setPlayersError(json?.error ?? "Failed to load roster"); return; }
      const rows: string[][] = json.values ?? [];
      if (rows.length < 2) { setPlayers([]); return; }
      const headers = rows[0].map((h: string) => h.toLowerCase().trim());
      const col = (name: string) => headers.indexOf(name);
      const parsed: PlayerRow[] = rows.slice(1)
        .filter(r => r.some(c => c?.trim()))
        .map(r => ({
          id:                r[col("id")]                ?? r[0] ?? Math.random().toString(36).slice(2),
          name:              r[col("name")]              ?? r[1] ?? "",
          grade:             r[col("grade")]             ?? r[2] ?? "",
          position:          r[col("position")]          ?? r[3] ?? "",
          secondaryPosition: r[col("secondaryposition")] ?? r[4] ?? "",
          returning:         r[col("returning")]         ?? r[5] ?? "",
          likelihoodPrimary: r[col("likelihood")]        ?? r[6] ?? "",
          potentialPrimary:  r[col("potential")]         ?? r[7] ?? "",
          notes:             r[col("notes")]             ?? r[8] ?? "",
          picture:           r[col("picture")]           ?? r[9] ?? "",
        }));
      setPlayers(parsed);
    } catch (e: any) {
      setPlayersError(e?.message ?? "Error loading roster");
    } finally {
      setPlayersLoading(false);
    }
  }

  // ── Save ────────────────────────────────────────────────────────────────────
  async function saveBoard() {
    if (!board) return;
    setSaving(true);
    const nextData = {
      ...board.data,
      htmlBoard: { placed: placedPlayers, objects: boardObjects, backgroundUrl, cardSizeMode },
      googleConfig,
    };
    const { error: err } = await supabase.from("boards")
      .update({ data: nextData }).eq("id", boardId);
    if (err) { setError(err.message); } else { setDirty(false); }
    setSaving(false);
  }

  // ── Mark dirty on data changes ──────────────────────────────────────────────
  function updatePlaced(next: PlacedPlayer[]) { setPlacedPlayers(next); setDirty(true); }
  function updateObjects(next: BoardObject[])  { setBoardObjects(next);  setDirty(true); }

  // ── Player drag start (from roster sidebar) ─────────────────────────────────
  function onPlayerDragStart(e: React.DragEvent, p: PlayerRow) {
    const payload: PlayerPayload = {
      id: p.id, name: p.name, grade: p.grade,
      pos1: p.position, pos2: p.secondaryPosition,
      likelihood: p.likelihoodPrimary, notes: p.notes,
      pictureUrl: p.picture || p.pictureProxyUrl,
    };
    e.dataTransfer.setData(PLAYER_DRAG_MIME, JSON.stringify(payload));
    e.dataTransfer.effectAllowed = "copy";
  }

  // ── Add player to board (tap button — mobile) ───────────────────────────────
  function addPlayerToBoard(p: PlayerRow) {
    const payload: PlayerPayload = {
      id: p.id, name: p.name, grade: p.grade,
      pos1: p.position, pos2: p.secondaryPosition,
      likelihood: p.likelihoodPrimary, notes: p.notes,
      pictureUrl: p.picture || p.pictureProxyUrl,
    };
    const existing = placedPlayers.find(pp => pp.player.id === payload.id);
    if (existing) return; // already on board
    const newPlaced: PlacedPlayer = {
      id: Math.random().toString(36).slice(2),
      player: payload,
      x: 100 + placedPlayers.length * 10,
      y: 100 + placedPlayers.length * 10,
    };
    updatePlaced([...placedPlayers, newPlaced]);
  }

  // ── Background upload ────────────────────────────────────────────────────────
  async function onBgFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext  = file.name.split(".").pop();
    const path = `${boardId}/bg.${ext}`;
    const { error: upErr } = await supabase.storage.from(BG_BUCKET).upload(path, file, { upsert: true });
    if (upErr) { setError(upErr.message); return; }
    const { data: { publicUrl } } = supabase.storage.from(BG_BUCKET).getPublicUrl(path);
    setBackgroundUrl(publicUrl);
    setDirty(true);
  }

  // ── Save sheet config ────────────────────────────────────────────────────────
  function saveSheetConfig() {
    if (!sheetIdInput.trim()) return;
    const gc = { sheetId: sheetIdInput.trim(), range: sheetRangeInput.trim() || "Sheet1!A:I" };
    setGoogleConfig(gc);
    setShowSheetEdit(false);
    setDirty(true);
  }

  // ── Filtered players ─────────────────────────────────────────────────────────
  const filteredPlayers = players.filter(p => {
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchGrade  = gradeFilter === "all" || p.grade === gradeFilter;
    return matchSearch && matchGrade;
  });
  const allGrades = [...new Set(players.map(p=>p.grade).filter(Boolean))].sort();
  const canEdit = myRole === "admin" || myRole === "editor";
  // ── Tool button style helper ─────────────────────────────────────────────────
  const toolBtn = (active: boolean, color = "#7c3aed") => ({
    padding: "6px 12px", borderRadius: 7, fontSize: 12, fontWeight: 600,
    background: active ? color : "#1e293b",
    color: active ? "#fff" : "#94a3b8",
    border: `1px solid ${active ? color : "#334155"}`,
    cursor: "pointer", whiteSpace: "nowrap" as const, flexShrink: 0,
  });

  // ── Render ───────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#64748b",fontSize:16}}>Loading board…</div>
    </div>
  );

  if (error && !board) return (
    <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}>
      <div style={{color:"#f87171",fontSize:16}}>{error}</div>
      <Link href="/app/teams" style={{color:"#3b82f6",fontSize:14}}>← Back to Teams</Link>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:"#0f172a",overflow:"hidden"}}>

      {/* ── Toolbar ─────────────────────────────────────────────────────────── */}
      <div style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",background:"#0f172a",borderBottom:"1px solid #1e3a5f",overflowX:"auto",flexShrink:0,WebkitOverflowScrolling:"touch" as any,scrollbarWidth:"none" as any}}>

        {/* Board name */}
        <Link href={`/app/boards?team=${board?.team_id}`} style={{color:"#64748b",textDecoration:"none",fontSize:12,flexShrink:0}}>←</Link>
        <span style={{color:"#60a5fa",fontWeight:700,fontSize:13,flexShrink:0,maxWidth:120,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{board?.name}</span>

        <div style={{width:1,height:20,background:"#1e3a5f",flexShrink:0,margin:"0 4px"}}/>

        {/* Save */}
        {canEdit && (
          <button onClick={saveBoard} disabled={saving}
            style={{...toolBtn(dirty,"#1d4ed8"), opacity: saving ? 0.6 : 1}}>
            {saving ? "Saving…" : dirty ? "● Save" : "✓ Saved"}
          </button>
        )}

        {/* Edit toggle */}
        {canEdit && (
          <button onClick={()=>setEditMode(m=>!m)} style={toolBtn(editMode,"#dc2626")}>
            {editMode ? "✏ Editing" : "✏ Edit"}
          </button>
        )}

        {/* Reload */}
        <button onClick={()=>{ loadBoard(); if(googleConfig) loadPlayers(); }} style={toolBtn(false)}>↻ Reload</button>

        <div style={{width:1,height:20,background:"#1e3a5f",flexShrink:0,margin:"0 4px"}}/>

        {/* Tools — only in edit mode */}
        {editMode && !objectsLocked && (<>
          <button onClick={()=>setTool(t=>t==="select"?"pointer":"select")} style={toolBtn(tool==="select")}>⬚ Select</button>
          <button onClick={()=>setTool(t=>t==="lane"?"pointer":"lane")}     style={toolBtn(tool==="lane")}>▦ Lane</button>
          <button onClick={()=>setTool(t=>t==="text"?"pointer":"text")}     style={toolBtn(tool==="text")}>T Text</button>
          <button onClick={()=>setTool(t=>t==="note"?"pointer":"note")}     style={toolBtn(tool==="note")}>📝 Note</button>
          <div style={{width:1,height:20,background:"#1e3a5f",flexShrink:0,margin:"0 4px"}}/>
        </>)}

        {/* Lock */}
        {canEdit && (
          <button onClick={()=>{ setObjectsLocked(l=>!l); if(tool!=="pointer") setTool("pointer"); }}
            style={toolBtn(objectsLocked,"#b45309")}>
            {objectsLocked ? "🔒 Locked" : "🔓 Lock"}
          </button>
        )}

        <div style={{width:1,height:20,background:"#1e3a5f",flexShrink:0,margin:"0 4px"}}/>

        {/* Card size */}
        <select value={cardSizeMode} onChange={e=>{ setCardSizeMode(e.target.value as any); setDirty(true); }}
          style={{padding:"5px 8px",background:"#1e293b",color:"#94a3b8",border:"1px solid #334155",borderRadius:7,fontSize:12,cursor:"pointer",flexShrink:0}}>
          <option value="large">Cards: Large</option>
          <option value="medium">Cards: Medium</option>
          <option value="small">Cards: Small</option>
        </select>

        {/* Roster toggle */}
        <button onClick={()=>setSidebarOpen(s=>!s)} style={toolBtn(sidebarOpen,"#0f766e")}>
          👥 Roster
        </button>

        {/* Background */}
        {canEdit && (<>
          <button onClick={()=>bgInputRef.current?.click()} style={toolBtn(false)}>🖼 BG</button>
          {backgroundUrl && <button onClick={()=>{ setBackgroundUrl(null); setDirty(true); }} style={toolBtn(false)}>✕ BG</button>}
          <input ref={bgInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={onBgFileChange}/>
        </>)}

        {/* Sheet config */}
        {canEdit && (
          <button onClick={()=>{ setSheetIdInput(googleConfig?.sheetId??""); setSheetRangeInput(googleConfig?.range??"Sheet1!A:I"); setShowSheetEdit(true); }}
            style={toolBtn(!!googleConfig,"#059669")}>
            📊 Sheet
          </button>
        )}
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div style={{flex:1,display:"flex",overflow:"hidden",minHeight:0}}>

        {/* ── Roster Sidebar ───────────────────────────────────────────────── */}
        {sidebarOpen && (
          <div style={{width:220,flexShrink:0,background:"#1e293b",borderRight:"1px solid #1e3a5f",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"10px 12px",borderBottom:"1px solid #1e3a5f",flexShrink:0}}>
              <input type="text" placeholder="Search players…" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                style={{width:"100%",padding:"7px 10px",background:"#0f172a",border:"1px solid #334155",borderRadius:7,color:"#f1f5f9",fontSize:12,outline:"none",boxSizing:"border-box"}}/>
              <select value={gradeFilter} onChange={e=>setGradeFilter(e.target.value)}
                style={{marginTop:6,width:"100%",padding:"6px 8px",background:"#0f172a",border:"1px solid #334155",borderRadius:7,color:"#94a3b8",fontSize:12,outline:"none"}}>
                <option value="all">All Grades</option>
                {allGrades.map(g=><option key={g} value={g}>Grade {g}</option>)}
              </select>
            </div>

            <div style={{flex:1,overflowY:"auto",padding:"8px 8px"}}>
              {!googleConfig ? (
                <div style={{padding:"20px 8px",textAlign:"center"}}>
                  <p style={{color:"#64748b",fontSize:12,margin:"0 0 10px"}}>No roster source configured.</p>
                  {canEdit && <button onClick={()=>setShowSheetEdit(true)} style={{padding:"7px 12px",background:"#059669",color:"#fff",border:"none",borderRadius:6,fontSize:12,cursor:"pointer"}}>Add Sheet</button>}
                </div>
              ) : playersLoading ? (
                <div style={{padding:16,color:"#64748b",fontSize:12,textAlign:"center"}}>Loading roster…</div>
              ) : playersError ? (
                <div style={{padding:12,color:"#f87171",fontSize:12}}>{playersError}</div>
              ) : filteredPlayers.length === 0 ? (
                <div style={{padding:16,color:"#64748b",fontSize:12,textAlign:"center"}}>No players found</div>
              ) : filteredPlayers.map(p => {
                const bg  = gradeColor(p.grade);
                const fg  = gradeText(p.grade);
                const onBoard = placedPlayers.some(pp=>pp.player.id===p.id);
                return (
                  <div key={p.id}
                    draggable={editMode && !objectsLocked}
                    onDragStart={e=>onPlayerDragStart(e,p)}
                    style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",marginBottom:4,background:bg,borderRadius:8,cursor:editMode&&!objectsLocked?"grab":"default",opacity:onBoard?0.5:1,border:"1px solid rgba(255,255,255,0.1)"}}>
                    {/* Photo */}
                    <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(255,255,255,0.15)",overflow:"hidden",flexShrink:0}}>
                      {p.picture && <img src={p.picture} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:fg,fontWeight:700,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                      <div style={{color:fg,fontSize:10,opacity:0.7}}>{p.position}{p.grade?" · Gr."+p.grade:""}</div>
                    </div>
                    {/* Add to board button for mobile */}
                    {editMode && !objectsLocked && !onBoard && (
                      <button onClick={()=>addPlayerToBoard(p)}
                        title="Add to board"
                        style={{flexShrink:0,width:20,height:20,borderRadius:"50%",background:"rgba(255,255,255,0.2)",border:"none",color:fg,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,fontWeight:700}}>+</button>
                    )}
                    {onBoard && <span style={{color:fg,fontSize:10,opacity:0.5,flexShrink:0}}>✓</span>}
                  </div>
                );
              })}
            </div>

            {/* Reload roster */}
            {googleConfig && (
              <div style={{padding:"8px 12px",borderTop:"1px solid #1e3a5f",flexShrink:0}}>
                <button onClick={loadPlayers} style={{width:"100%",padding:"7px",background:"#1e3a5f",color:"#94a3b8",border:"1px solid #334155",borderRadius:7,fontSize:12,cursor:"pointer"}}>
                  ↻ Reload Roster
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Board Canvas ──────────────────────────────────────────────────── */}
        <div style={{flex:1,minWidth:0,overflow:"hidden",position:"relative"}}>
          {error && (
            <div style={{position:"absolute",top:8,left:"50%",transform:"translateX(-50%)",background:"#7f1d1d",color:"#fca5a5",padding:"8px 16px",borderRadius:8,fontSize:13,zIndex:50}}>
              {error}
            </div>
          )}
          <HtmlBoard
            editMode={editMode}
            objectsLocked={objectsLocked}
            placed={placedPlayers}
            onPlacedChange={updatePlaced}
            objects={boardObjects}
            onObjectsChange={updateObjects}
            tool={tool}
            onToolChange={setTool}
            cardSizeMode={cardSizeMode}
            playerDragMime={PLAYER_DRAG_MIME}
            objectDragMime={OBJECT_DRAG_MIME}
            backgroundUrl={backgroundUrl}
            onAddPlayerToBoard={addPlayerToBoard}
          />
        </div>
      </div>

      {/* ── Sheet Config Modal ───────────────────────────────────────────────── */}
      {showSheetEdit && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}} onClick={()=>setShowSheetEdit(false)}>
          <div style={{background:"#1e293b",borderRadius:14,padding:28,width:"100%",maxWidth:460,border:"1px solid #334155"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{color:"#f1f5f9",fontSize:18,fontWeight:700,margin:"0 0 20px"}}>📊 Google Sheet Roster</h3>
            <label style={{display:"block",color:"#94a3b8",fontSize:12,fontWeight:600,marginBottom:5}}>SHEET ID</label>
            <input type="text" value={sheetIdInput} onChange={e=>setSheetIdInput(e.target.value)}
              placeholder="Paste the Google Sheet ID from the URL"
              style={{width:"100%",padding:"9px 12px",background:"#0f172a",border:"1px solid #334155",borderRadius:7,color:"#f1f5f9",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:12}}/>
            <label style={{display:"block",color:"#94a3b8",fontSize:12,fontWeight:600,marginBottom:5}}>RANGE</label>
            <input type="text" value={sheetRangeInput} onChange={e=>setSheetRangeInput(e.target.value)}
              placeholder="Sheet1!A:I"
              style={{width:"100%",padding:"9px 12px",background:"#0f172a",border:"1px solid #334155",borderRadius:7,color:"#f1f5f9",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:16}}/>
            <p style={{color:"#475569",fontSize:11,margin:"0 0 20px"}}>The sheet ID is the long string in the Google Sheets URL between /d/ and /edit</p>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setShowSheetEdit(false)} style={{padding:"9px 18px",background:"transparent",color:"#94a3b8",border:"1px solid #334155",borderRadius:8,fontSize:14,cursor:"pointer"}}>Cancel</button>
              <button onClick={saveSheetConfig} disabled={!sheetIdInput.trim()}
                style={{padding:"9px 20px",background:"#059669",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer"}}>Save & Load</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
