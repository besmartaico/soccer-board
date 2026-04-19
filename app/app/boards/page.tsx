"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
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
    if (!user) { router.push("/login"); return; }

    const [{ data: teamData }, { data: roleData }, { data: boardData }] = await Promise.all([
      supabase.from("teams").select("id,name").eq("id", teamId).single(),
      supabase.from("team_members").select("role").eq("team_id", teamId).eq("user_id", user.id).maybeSingle(),
      supabase.from("boards").select("id,name,created_at,team_id,data").eq("team_id", teamId).order("created_at", {ascending:false}),
    ]);

    setTeam(teamData);
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

  return (
    <div style={{minHeight:"100vh",background:DARK,color:"#f1f5f9"}}>
      {/* Header */}
      <div style={{background:MID,borderBottom:`1px solid ${BORDER}`,padding:"0 24px",display:"flex",alignItems:"center",height:52,gap:10}}>
        <Link href="/app/teams" style={{color:"#64748b",textDecoration:"none",fontSize:13,display:"flex",alignItems:"center",gap:4}}>← Teams</Link>
        <span style={{color:BORDER,fontSize:16}}>|</span>
        <span style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>{team?.name ?? "…"}</span>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"32px 20px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12}}>
          <div>
            <h1 style={{fontSize:24,fontWeight:800,color:"#f1f5f9",margin:"0 0 4px"}}>{team?.name} Boards</h1>
            <p style={{color:"#64748b",fontSize:13,margin:0}}>{boards.length} board{boards.length!==1?"s":""}</p>
          </div>
          {canEdit && (
            <button onClick={()=>setShowCreate(true)} style={btnPrimary()}>+ Create Board</button>
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
            {boards.map(board => (
              <div key={board.id} style={{background:MID,borderRadius:12,border:`1px solid ${BORDER}`,overflow:"hidden",position:"relative",transition:"all 0.15s"}}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor=MAROON;(e.currentTarget as HTMLElement).style.transform="translateY(-2px)";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor=BORDER;(e.currentTarget as HTMLElement).style.transform="translateY(0)";}}>
                <div style={{height:3,background:boardColor(board.id)}}/>
                <Link href={"/app/boards/"+board.id} style={{textDecoration:"none",display:"block",padding:"18px 18px 14px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                    <div style={{width:38,height:38,borderRadius:9,background:boardColor(board.id),display:"flex",alignItems:"center",justifyContent:"center",fontSize:17,fontWeight:800,color:"#fff",flexShrink:0}}>
                      {boardInitial(board.name)}
                    </div>
                    <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{board.name}</div>
                  </div>
                  <div style={{color:"#475569",fontSize:11,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span>{(board.data?.htmlBoard?.placed?.length ?? board.data?.placed?.length ?? 0)} players</span>
                    <span>{formatDate(board.created_at)}</span>
                  </div>
                  <div style={{marginTop:10,color:MAROON,fontSize:12,fontWeight:600}}>Open →</div>
                </Link>
                {canEdit && (
                  <button onClick={e=>{e.preventDefault();setDeleteId(board.id);}}
                    style={{position:"absolute",top:10,right:10,background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:15,padding:"2px 5px",borderRadius:4}}>✕</button>
                )}
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
