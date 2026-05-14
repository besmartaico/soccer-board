"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import RosterImportModal from "./RosterImportModal";
import InlineEditable from "@/lib/InlineEditable";
import { supabase } from "@/lib/supabaseClient";


const MAROON = "#7f1630";
const DARK   = "#0d1117";
const MID    = "#161b27";
const BORDER = "#2a1520";


type BoardRow = { id: string; name: string; created_at: string; team_id: string; data: any; };
type TeamRow  = { id: string; name: string; };
type GoogleConfig = { sheetId: string; range: string; };


// Parse Google Sheet ID from a URL or bare ID
function parseSheetInput(input: string): { sheetId: string; range: string } | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  // Full URL: https://docs.google.com/spreadsheets/d/SHEET_ID/edit...
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (urlMatch) return { sheetId: urlMatch[1], range: "Sheet1!A:Z" };
  // Bare ID (no slashes, no spaces)
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return { sheetId: trimmed, range: "Sheet1!A:Z" };
  return null;
}


function BoardsPageInner() {
  const router      = useRouter();
  const params      = useSearchParams();
  const teamId      = params.get("team") ?? "";


  const [team,       setTeam]       = useState<TeamRow | null>(null);
  const [boards,     setBoards]     = useState<BoardRow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [myRole,     setMyRole]     = useState("viewer");
  const [teamConfig, setTeamConfig] = useState<GoogleConfig | null>(null);


  // Create board modal
  const [showCreate, setShowCreate] = useState(false);
  const [boardOrder, setBoardOrder] = useState<string[]>([]);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [newName,    setNewName]    = useState("");
  const [sheetUrl,   setSheetUrl]   = useState("");
  const [sheetError, setSheetError] = useState("");
  const [creating,   setCreating]   = useState(false);


  // Delete confirm
  const [deleteId,   setDeleteId]   = useState<string|null>(null);
  const [deleting,   setDeleting]   = useState(false);


  useEffect(() => { if (teamId) load(); else router.push("/app/teams"); }, [teamId]);


  async function load() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: sessData } = await supabase.auth.getSession();
    setAccessToken(sessData?.session?.access_token ?? null);
    if (!user) { router.push("/login"); return; }


    const [{ data: teamData }, { data: roleData }, { data: boardData }] = await Promise.all([
      supabase.from("teams").select("id,name").eq("id", teamId).single(),
      supabase.from("team_members").select("role").eq("team_id", teamId).eq("user_id", user.id).maybeSingle(),
      supabase.from("boards").select("id,name,created_at,team_id,data").eq("team_id", teamId).order("created_at", {ascending:false}),
    ]);


    setTeam(teamData);
    setBoardOrder(Array.isArray((roleData as any)?.board_order) ? (roleData as any).board_order : []);
    setMyRole(roleData?.role ?? "viewer");


    const rows = boardData ?? [];
    setBoards(rows);


    // Inherit team-level Google config from most recent board that has one
    for (const b of rows) {
      const gc = b.data?.googleConfig;
      if (gc?.sheetId) { setTeamConfig(gc); setSheetUrl(`https://docs.google.com/spreadsheets/d/${gc.sheetId}/edit`); break; }
    }
    setLoading(false);
  }


  async function createBoard() {
    if (!newName.trim()) return;
    setSheetError("");


    let googleConfig: GoogleConfig | null = null;
    if (sheetUrl.trim()) {
      const parsed = parseSheetInput(sheetUrl);
      if (!parsed) { setSheetError("Couldn't parse that URL. Paste the full Google Sheets URL."); return; }
      googleConfig = parsed;
    } else if (teamConfig) {
      // inherit from team
      googleConfig = teamConfig;
    }


    setCreating(true);
    const { data, error: err } = await supabase.from("boards").insert({
      team_id: teamId,
      name: newName.trim(),
      data: { htmlBoard: { placed:[], objects:[], backgroundUrl:null, cardSizeMode:"medium" }, googleConfig }
    }).select().single();
    if (err) { setError(err.message); setCreating(false); return; }
    setShowCreate(false); setNewName(""); setCreating(false);
    router.push("/app/boards/" + data.id);
  }


  async function deleteBoard() {
    if (!deleteId) return;
    setDeleting(true);
    await supabase.from("boards").delete().eq("id", deleteId);
    setDeleteId(null); setDeleting(false);
    load();
  }


  const canEdit = myRole === "admin" || myRole === "editor";
  const formatDate = (s: string) => new Date(s).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
  const boardColors = [MAROON,"#1d4ed8","#7c3aed","#0f766e","#b45309","#2d3748"];
  const boardColor  = (id: string) => boardColors[id.charCodeAt(0) % boardColors.length];
  const boardInitial = (name: string) => name.slice(0,1).toUpperCase();


  const inputStyle = {width:"100%",padding:"10px 14px",background:DARK,border:`1px solid ${BORDER}`,borderRadius:8,color:"#f1f5f9",fontSize:14,outline:"none",boxSizing:"border-box" as const};
  const btnPrimary = (disabled=false) => ({padding:"10px 22px",background:disabled?BORDER:MAROON,color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.6:1});
  const btnSecondary = (disabled=false) => ({padding:"10px 22px",background:"transparent",color:"#cbd5e1",border:`1px solid ${BORDER}`,borderRadius:8,fontSize:14,fontWeight:700,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.6:1});


  return (
    <div style={{minHeight:"100vh",background:DARK,color:"#f1f5f9"}}>
      {/* Header */}
      <div style={{background:MID,borderBottom:`1px solid ${BORDER}`,padding:"0 24px",display:"flex",alignItems:"center",height:52,gap:10}}>
        <Link href="/app/teams" style={{color:"#64748b",textDecoration:"none",fontSize:13,display:"flex",alignItems:"center",gap:4}}>← Teams</Link>
        <span style={{color:BORDER,fontSize:16}}>|</span>
        <InlineEditable
          value={team?.name ?? ""}
          canEdit={canEdit}
          placeholder="…"
          style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}
          onSave={async (newName) => {
            const res = await fetch(`/api/teams/${teamId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
              body: JSON.stringify({ name: newName }),
            });
            if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err?.error ?? "Failed to rename team"); }
            const data = await res.json();
            setTeam(data.team);
          }}
        />
      </div>


      <div style={{maxWidth:1100,margin:"0 auto",padding:"32px 20px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12}}>
          <div>
            <h1 style={{fontSize:24,fontWeight:800,color:"#f1f5f9",margin:"0 0 4px"}}>{team?.name} Boards</h1>
            <p style={{color:"#64748b",fontSize:13,margin:0}}>{boards.length} board{boards.length!==1?"s":""}</p>
          </div>
          {canEdit && (
            <>
              <button onClick={()=>setShowImport(true)} style={btnSecondary()}>📥 Import Roster</button>
              <button onClick={()=>setShowCreate(true)} style={btnPrimary()}>+ Create Board</button>
            </>
          )}
        </div>


        {error && <div style={{background:"rgba(127,22,48,0.2)",color:"#fca5a5",padding:"10px 14px",borderRadius:8,fontSize:13,marginBottom:20,border:`1px solid ${MAROON}`}}>{error}</div>}


        {loading ? (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:20}}>
            {[1,2,3,4].map(i=><div key={i} style={{height:150,background:MID,borderRadius:12}}/>)}
          </div>
        ) : boards.length === 0 ? (
          <div style={{textAlign:"center",padding:"60px 20px",background:MID,borderRadius:12,border:`1px solid ${BORDER}`}}>
            <div style={{fontSize:40,marginBottom:12}}>📋</div>
            <p style={{color:"#94a3b8",fontSize:15,margin:"0 0 20px"}}>No boards yet for this team.</p>
            {canEdit && <button onClick={()=>setShowCreate(true)} style={btnPrimary()}>Create First Board</button>}
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:20}}>
            {(() => { const idx = new Map(boardOrder.map((id, i) => [id, i])); const ordered = [...boards].sort((a, b) => { const ai = idx.has(a.id) ? idx.get(a.id)! : Number.MAX_SAFE_INTEGER; const bi = idx.has(b.id) ? idx.get(b.id)! : Number.MAX_SAFE_INTEGER; if (ai !== bi) return ai - bi; return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); }); return ordered; })().map(board => (
              <div key={board.id}
                onDragEnter={canEdit ? () => { if (dragIdRef.current && dragIdRef.current !== board.id) { setDragOverId(board.id); } } : undefined}
                onDragOver={canEdit ? (e) => { if (dragIdRef.current && dragIdRef.current !== board.id) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } } : undefined}
                onDragLeave={canEdit ? () => { setDragOverId(prev => prev === board.id ? null : prev); } : undefined}
                onDrop={canEdit ? async (e) => {
                  e.preventDefault();
                  const sourceId = dragIdRef.current;
                  setDragOverId(null);
                  if (!sourceId || sourceId === board.id) return;
                  const currentOrder = (() => { const idx = new Map(boardOrder.map((id, i) => [id, i])); return [...boards].sort((a, b) => { const ai = idx.has(a.id) ? idx.get(a.id)! : Number.MAX_SAFE_INTEGER; const bi = idx.has(b.id) ? idx.get(b.id)! : Number.MAX_SAFE_INTEGER; if (ai !== bi) return ai - bi; return new Date(b.created_at).getTime() - new Date(a.created_at).getTime(); }).map(b => b.id); })();
                  const fromIdx = currentOrder.indexOf(sourceId);
                  const toIdx = currentOrder.indexOf(board.id);
                  if (fromIdx < 0 || toIdx < 0) return;
                  const next = [...currentOrder];
                  next.splice(fromIdx, 1);
                  next.splice(toIdx, 0, sourceId);
                  setBoardOrder(next);
                  fetch(`/api/teams/${teamId}/board-order`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
                    body: JSON.stringify({ orderedIds: next }),
                  }).catch(() => {});
                } : undefined}
                style={{background:MID,borderRadius:12,border: dragOverId === board.id ? `2px dashed #60a5fa` : `1px solid ${BORDER}`,overflow:"hidden",position:"relative",transition:"all 0.15s"}}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=MAROON;(e.currentTarget as HTMLElement).style.transform="translateY(-2px)";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=BORDER;(e.currentTarget as HTMLElement).style.transform="translateY(0)";}}>
                <div style={{height:3,background:boardColor(board.id)}}/>
                <Link href={"/app/boards/"+board.id} style={{textDecoration:"none",display:"block",padding:"18px 18px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                    <div style={{width:38,height:38,borderRadius:9,background:boardColor(board.id),display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:800,color:"#fff",flexShrink:0}}>
                      {boardInitial(board.name)}
                    </div>
                    <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}><InlineEditable
                                value={board.name}
                                canEdit={canEdit}
                                style={{fontWeight:700,fontSize:16,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"inline-block",maxWidth:"100%"}}
                                onSave={async (newName) => {
                                  const res = await fetch(`/api/boards/${board.id}`, {
                                    method: "PATCH",
                                    headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
                                    body: JSON.stringify({ name: newName }),
                                  });
                                  if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err?.error ?? "Failed to rename board"); }
                                  setBoards(bs => bs.map(b => b.id === board.id ? { ...b, name: newName } : b));
                                }}
                              /></div>
                  </div>
                  <div style={{color:"#475569",fontSize:11,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span>{(board.data?.htmlBoard?.placed?.length ?? board.data?.placed?.length ?? 0)} players</span>
                    <span>{formatDate(board.created_at)}</span>
                  </div>
                  <div style={{marginTop:10,color:MAROON,fontSize:12,fontWeight:600}}>Open →</div>
                </Link>
                {canEdit && (<>
                  <button
                    draggable={true}
                    onDragStart={(e) => { dragIdRef.current = board.id; e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", board.id); } catch {} }}
                    onDragEnd={() => { dragIdRef.current = null; setDragOverId(null); }}
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                    title="Drag to reorder"
                    style={{position:"absolute",top:8,right:8,background:"rgba(127,22,48,0.20)",border:"1px solid rgba(127,22,48,0.55)",color:"#f1f5f9",cursor:"grab",fontSize:14,fontWeight:700,padding:"3px 9px",borderRadius:6,lineHeight:1,letterSpacing:1,zIndex:5}}>≡</button>
                  <button onClick={async e=>{e.preventDefault();const res=await fetch(`/api/boards/${board.id}/duplicate`,{method:"POST",headers:{"Content-Type":"application/json",...(accessToken?{Authorization:`Bearer ${accessToken}`}:{})}});if(!res.ok){const err=await res.json().catch(()=>({}));alert(err?.error??"Failed to duplicate");return;}const data=await res.json();setBoards(bs=>[...bs,data.board]);}}
                      style={{position:"absolute",top:10,right:76,background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:14,padding:"2px 5px",borderRadius:4}} title="Duplicate board">⎘</button>
                    <button onClick={e=>{e.preventDefault();setDeleteId(board.id);}}
                    style={{position:"absolute",top:10,right:46,background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:15,padding:"2px 5px",borderRadius:4}}>✕</button>
                </>)}
              </div>
            ))}
          </div>
        )}
      </div>


      {/* ── Create Board Modal ── */}
      {showCreate && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}} onClick={()=>setShowCreate(false)}>
          <div style={{background:MID,borderRadius:14,padding:32,width:"100%",maxWidth:500,border:`1px solid ${BORDER}`,maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <h2 style={{color:"#f1f5f9",fontSize:19,fontWeight:800,margin:"0 0 24px"}}>Create New Board</h2>


            <label style={{display:"block",color:"#64748b",fontSize:11,fontWeight:700,marginBottom:6,letterSpacing:"0.08em"}}>BOARD NAME</label>
            <input type="text" value={newName} onChange={e=>setNewName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&createBoard()}
              placeholder="e.g. Varsity 4-3-3 Formation" autoFocus
              style={{...inputStyle,marginBottom:20}}/>


            <div style={{background:DARK,borderRadius:10,padding:16,marginBottom:20,border:`1px solid ${BORDER}`}}>
              <div style={{color:"#94a3b8",fontSize:13,fontWeight:600,marginBottom:12}}>📊 Google Sheet Roster</div>


              {teamConfig && !sheetUrl.includes(teamConfig.sheetId) && (
                <div style={{background:"rgba(127,22,48,0.15)",border:`1px solid ${MAROON}`,borderRadius:7,padding:"8px 12px",marginBottom:10,fontSize:12,color:"#e8a0b0"}}>
                  ✓ Team roster will be inherited automatically. Paste a different URL below to override.
                </div>
              )}


              <label style={{display:"block",color:"#64748b",fontSize:11,fontWeight:700,marginBottom:6,letterSpacing:"0.08em"}}>GOOGLE SHEETS URL (optional)</label>
              <input type="url" value={sheetUrl} onChange={e=>{setSheetUrl(e.target.value);setSheetError("");}}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                style={{...inputStyle,fontSize:12}}/>
              {sheetError && <p style={{color:"#f87171",fontSize:11,margin:"6px 0 0"}}>{sheetError}</p>}
              <p style={{color:"#475569",fontSize:11,margin:"8px 0 0"}}>Paste the full URL from your browser — we'll extract the Sheet ID automatically.</p>
            </div>


            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>{setShowCreate(false);setNewName("");setSheetUrl("");setSheetError("");}}
                style={{padding:"10px 18px",background:"transparent",color:"#94a3b8",border:`1px solid ${BORDER}`,borderRadius:8,fontSize:14,cursor:"pointer"}}>Cancel</button>
              <button onClick={createBoard} disabled={creating||!newName.trim()} style={btnPrimary(creating||!newName.trim())}>
                {creating?"Creating…":"Create Board"}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── Roster Import Modal ── */}
      {showImport && teamId && (
        <RosterImportModal
          teamId={teamId}
          accessToken={accessToken}
          onClose={()=>setShowImport(false)}
          onImported={(count)=>{
            setShowImport(false);
            alert(`Imported ${count} players into the team roster.`);
          }}
        />
      )}


      {/* ── Delete Confirm ── */}
      {deleteId && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={()=>setDeleteId(null)}>
          <div style={{background:MID,borderRadius:12,padding:28,width:"100%",maxWidth:380,border:`1px solid ${BORDER}`}} onClick={e=>e.stopPropagation()}>
            <h3 style={{color:"#f1f5f9",fontSize:17,fontWeight:700,margin:"0 0 10px"}}>Delete this board?</h3>
            <p style={{color:"#94a3b8",fontSize:13,margin:"0 0 20px"}}>All players and objects on the board will be permanently deleted. This cannot be undone.</p>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setDeleteId(null)} style={{padding:"9px 18px",background:"transparent",color:"#94a3b8",border:`1px solid ${BORDER}`,borderRadius:8,fontSize:14,cursor:"pointer"}}>Cancel</button>
              <button onClick={deleteBoard} disabled={deleting} style={{padding:"9px 20px",background:"#b91c1c",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer"}}>
                {deleting?"Deleting…":"Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default function BoardsPage() {
  return (
    <Suspense fallback={<div style={{minHeight:"100vh",background:"#0d1117",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b"}}>Loading…</div>}>
      <BoardsPageInner />
    </Suspense>
  );
}
