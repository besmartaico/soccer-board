"use client";
import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type BoardRow = { id: string; name: string; created_at: string; team_id: string; data: any; };
type TeamRow  = { id: string; name: string; };

const SHEET_EXAMPLE = `Required Google Sheet columns (Row 1 = headers):
  A: id         — Unique player ID
  B: name       — Full name
  C: grade      — Grade year (9, 10, 11, or 12)
  D: position   — Primary position
  E: pos2       — Secondary position
  F: returning  — Returning? (yes/no)
  G: likelihood — Likelihood rating
  H: notes      — Scouting notes
  I: picture    — Photo URL (optional)`;

function BoardsPageInner() {
  const router = useRouter();
  const params = useSearchParams();
  const teamId = params.get("team") ?? "";

  const [team, setTeam] = useState<TeamRow | null>(null);
  const [boards, setBoards] = useState<BoardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [myRole, setMyRole] = useState("");

  // Create board modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [sheetId, setSheetId] = useState("");
  const [sheetRange, setSheetRange] = useState("Sheet1!A:I");
  const [creating, setCreating] = useState(false);
  const [showSheetHelp, setShowSheetHelp] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<string|null>(null);
  const [deleting, setDeleting] = useState(false);

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
    setBoards(boardData ?? []);
    setLoading(false);
  }

  async function createBoard() {
    if (!newName.trim()) return;
    setCreating(true);
    const { data, error: err } = await supabase.from("boards").insert({
      team_id: teamId,
      name: newName.trim(),
      data: {
        placed: [],
        objects: [],
        googleConfig: sheetId.trim() ? { sheetId: sheetId.trim(), range: sheetRange.trim() } : null,
        cardSizeMode: "medium",
        backgroundUrl: null,
      }
    }).select().single();
    if (err) { setError(err.message); setCreating(false); return; }
    setShowCreate(false);
    setNewName(""); setSheetId(""); setSheetRange("Sheet1!A:I");
    setCreating(false);
    router.push("/app/boards/" + data.id);
  }

  async function deleteBoard() {
    if (!deleteId) return;
    setDeleting(true);
    await supabase.from("boards").delete().eq("id", deleteId);
    setDeleteId(null);
    setDeleting(false);
    load();
  }

  const canEdit = myRole === "admin" || myRole === "editor";
  const boardInitial = (name: string) => name.slice(0,1).toUpperCase();
  const boardColor = (id: string) => {
    const colors = ["#1d4ed8","#7c3aed","#0f766e","#b45309","#be123c","#1e3a5f"];
    return colors[id.charCodeAt(0) % colors.length];
  };
  const formatDate = (s: string) => new Date(s).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});

  return (
    <div style={{minHeight:"100vh",background:"#0f172a",color:"#f1f5f9"}}>
      {/* Header */}
      <div style={{background:"#1e293b",borderBottom:"1px solid #1e3a5f",padding:"0 24px",display:"flex",alignItems:"center",height:56,gap:12}}>
        <Link href="/app/teams" style={{color:"#64748b",textDecoration:"none",fontSize:13,display:"flex",alignItems:"center",gap:4}}>
          ← Teams
        </Link>
        <span style={{color:"#334155"}}>|</span>
        <span style={{fontWeight:700,fontSize:16,color:"#f1f5f9"}}>{team?.name ?? "…"}</span>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"32px 20px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:28,flexWrap:"wrap",gap:12}}>
          <div>
            <h1 style={{fontSize:26,fontWeight:700,color:"#f1f5f9",margin:"0 0 4px"}}>{team?.name} Boards</h1>
            <p style={{color:"#64748b",fontSize:14,margin:0}}>{boards.length} board{boards.length !== 1?"s":""}</p>
          </div>
          {canEdit && (
            <button onClick={()=>setShowCreate(true)} style={{padding:"10px 20px",background:"#2563eb",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",gap:6}}>
              + Create Board
            </button>
          )}
        </div>

        {error && <div style={{background:"#7f1d1d",color:"#fca5a5",padding:"10px 14px",borderRadius:8,fontSize:14,marginBottom:20}}>{error}</div>}

        {loading ? (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:20}}>
            {[1,2,3,4].map(i=><div key={i} style={{height:150,background:"#1e293b",borderRadius:12}}/>)}
          </div>
        ) : boards.length === 0 ? (
          <div style={{textAlign:"center",padding:"60px 20px",background:"#1e293b",borderRadius:12}}>
            <div style={{fontSize:48,marginBottom:12}}>📋</div>
            <p style={{color:"#94a3b8",fontSize:16,margin:"0 0 20px"}}>No boards yet for this team.</p>
            {canEdit && <button onClick={()=>setShowCreate(true)} style={{padding:"10px 24px",background:"#2563eb",color:"#fff",border:"none",borderRadius:8,fontSize:15,fontWeight:600,cursor:"pointer"}}>Create First Board</button>}
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:20}}>
            {boards.map(board => (
              <div key={board.id} style={{background:"#1e293b",borderRadius:12,border:"1px solid #1e3a5f",overflow:"hidden",position:"relative",transition:"all 0.15s"}}
                onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor="#3b82f6";(e.currentTarget as HTMLElement).style.transform="translateY(-2px)";}}
                onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor="#1e3a5f";(e.currentTarget as HTMLElement).style.transform="translateY(0)";}}>
                <div style={{height:4,background:boardColor(board.id)}}/>
                <Link href={"/app/boards/"+board.id} style={{textDecoration:"none",display:"block",padding:"20px 20px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                    <div style={{width:40,height:40,borderRadius:10,background:boardColor(board.id),display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:"#fff",flexShrink:0}}>
                      {boardInitial(board.name)}
                    </div>
                    <div style={{fontWeight:700,fontSize:16,color:"#f1f5f9",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{board.name}</div>
                  </div>
                  <div style={{color:"#64748b",fontSize:12,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span>{(board.data?.placed?.length ?? 0)} players placed</span>
                    <span>{formatDate(board.created_at)}</span>
                  </div>
                  <div style={{marginTop:12,color:"#3b82f6",fontSize:13,fontWeight:600}}>Open Board →</div>
                </Link>
                {canEdit && (
                  <button onClick={e=>{e.preventDefault();setDeleteId(board.id);}}
                    style={{position:"absolute",top:12,right:12,background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:16,padding:"2px 6px",borderRadius:4,lineHeight:1}}
                    title="Delete board">✕</button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Board Modal */}
      {showCreate && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}} onClick={()=>setShowCreate(false)}>
          <div style={{background:"#1e293b",borderRadius:14,padding:32,width:"100%",maxWidth:500,border:"1px solid #334155",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
            <h2 style={{color:"#f1f5f9",fontSize:20,fontWeight:700,margin:"0 0 24px"}}>Create New Board</h2>

            <label style={{display:"block",color:"#94a3b8",fontSize:12,fontWeight:700,marginBottom:6,letterSpacing:1}}>BOARD NAME</label>
            <input type="text" value={newName} onChange={e=>setNewName(e.target.value)}
              onKeyDown={e=>e.key==="Enter" && createBoard()}
              placeholder="e.g. JV Formation - 4-3-3" autoFocus
              style={{width:"100%",padding:"10px 14px",background:"#0f172a",border:"1px solid #334155",borderRadius:8,color:"#f1f5f9",fontSize:15,outline:"none",boxSizing:"border-box",marginBottom:20}}/>

            <div style={{background:"#0f172a",borderRadius:10,padding:16,marginBottom:20,border:"1px solid #1e3a5f"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <span style={{color:"#f1f5f9",fontSize:14,fontWeight:600}}>📊 Roster Source (Google Sheet)</span>
                <button onClick={()=>setShowSheetHelp(s=>!s)} style={{background:"none",border:"1px solid #334155",color:"#64748b",borderRadius:6,padding:"2px 8px",fontSize:12,cursor:"pointer"}}>{showSheetHelp?"Hide":"?"} format</button>
              </div>
              {showSheetHelp && (
                <pre style={{background:"#1e293b",color:"#94a3b8",fontSize:11,padding:10,borderRadius:8,overflowX:"auto",marginBottom:12,whiteSpace:"pre-wrap"}}>{SHEET_EXAMPLE}</pre>
              )}
              <label style={{display:"block",color:"#64748b",fontSize:12,fontWeight:600,marginBottom:5}}>GOOGLE SHEET ID</label>
              <input type="text" value={sheetId} onChange={e=>setSheetId(e.target.value)}
                placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms"
                style={{width:"100%",padding:"9px 12px",background:"#0f172a",border:"1px solid #334155",borderRadius:7,color:"#f1f5f9",fontSize:13,outline:"none",boxSizing:"border-box",marginBottom:10}}/>
              <label style={{display:"block",color:"#64748b",fontSize:12,fontWeight:600,marginBottom:5}}>RANGE</label>
              <input type="text" value={sheetRange} onChange={e=>setSheetRange(e.target.value)}
                placeholder="Sheet1!A:I"
                style={{width:"100%",padding:"9px 12px",background:"#0f172a",border:"1px solid #334155",borderRadius:7,color:"#f1f5f9",fontSize:13,outline:"none",boxSizing:"border-box"}}/>
              <p style={{color:"#475569",fontSize:11,margin:"8px 0 0"}}>Optional — you can add or change this later on the board.</p>
            </div>

            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>{setShowCreate(false);setNewName("");}} style={{padding:"10px 18px",background:"transparent",color:"#94a3b8",border:"1px solid #334155",borderRadius:8,fontSize:14,cursor:"pointer"}}>Cancel</button>
              <button onClick={createBoard} disabled={creating||!newName.trim()} style={{padding:"10px 22px",background:creating?"#1e3a5f":"#2563eb",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:creating?"not-allowed":"pointer"}}>
                {creating?"Creating…":"Create Board"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm Modal */}
      {deleteId && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200}} onClick={()=>setDeleteId(null)}>
          <div style={{background:"#1e293b",borderRadius:12,padding:28,width:"100%",maxWidth:380,border:"1px solid #334155"}} onClick={e=>e.stopPropagation()}>
            <h3 style={{color:"#f1f5f9",fontSize:18,fontWeight:700,margin:"0 0 10px"}}>Delete Board?</h3>
            <p style={{color:"#94a3b8",fontSize:14,margin:"0 0 20px"}}>This will permanently delete the board and all its data. This cannot be undone.</p>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setDeleteId(null)} style={{padding:"9px 18px",background:"transparent",color:"#94a3b8",border:"1px solid #334155",borderRadius:8,fontSize:14,cursor:"pointer"}}>Cancel</button>
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
    <Suspense fallback={<div style={{minHeight:"100vh",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b"}}>Loading…</div>}>
      <BoardsPageInner />
    </Suspense>
  );
}
