"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import InlineEditable from "@/lib/InlineEditable";

const DARK = "#0d1117";
const MID = "#161b22";
const BORDER = "#30363d";
const MAROON = "#7f1630";

type Team = { id: string; name: string };
type Board = { id: string; name: string };
type Pattern = { id: string; name: string; description: string | null; source_board_id: string | null; created_at: string };

function PatternsInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const initialTeamId = sp.get("teamId");
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState<string | null>(initialTeamId);
  const [team, setTeam] = useState<Team | null>(null);
  const [myRole, setMyRole] = useState<string>("viewer");
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [creatingFromBoard, setCreatingFromBoard] = useState<string>("");
  const [creatingName, setCreatingName] = useState<string>("");
  const [showDup, setShowDup] = useState<Pattern | null>(null);
  const [dupTargetTeam, setDupTargetTeam] = useState<string>("");
  const [confirmDelete, setConfirmDelete] = useState<Pattern | null>(null);

  const canEdit = myRole === "admin" || myRole === "editor";

  useEffect(() => { load(); }, [teamId]);

  async function load() {
    setLoading(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data: sess } = await supabase.auth.getSession();
    setAccessToken(sess?.session?.access_token ?? null);

    const { data: memData } = await supabase
      .from("team_members").select("team_id").eq("user_id", user.id);
    const tIds = (memData ?? []).map((m: any) => m.team_id);
    if (tIds.length === 0) { setTeams([]); setLoading(false); return; }

    const { data: tData } = await supabase
      .from("teams").select("id,name").in("id", tIds).order("name");
    const allTeams = (tData ?? []) as Team[];
    setTeams(allTeams);

    const useTeamId = teamId || (allTeams[0]?.id ?? null);
    if (!useTeamId) { setLoading(false); return; }
    if (!teamId) setTeamId(useTeamId);
    setTeam(allTeams.find(t => t.id === useTeamId) ?? null);

    // Role on selected team
    const { data: r } = await supabase
      .from("team_members").select("role").eq("team_id", useTeamId).eq("user_id", user.id).maybeSingle();
    setMyRole(r?.role ?? "viewer");

    // Boards for this team (used in create dialog)
    const { data: b } = await supabase
      .from("boards").select("id,name").eq("team_id", useTeamId).order("name");
    setBoards((b ?? []) as Board[]);

    // Patterns for this team
    try {
      const res = await fetch(`/api/teams/${useTeamId}/patterns`, {
        headers: sess?.session ? { Authorization: `Bearer ${sess.session.access_token}` } : {},
      });
      if (res.ok) {
        const d = await res.json();
        setPatterns(d.patterns ?? []);
      } else {
        const d = await res.json().catch(()=>({}));
        setError(d?.error ?? "Failed to load patterns");
      }
    } catch (e: any) {
      setError(e?.message ?? "Network error");
    }
    setLoading(false);
  }

  async function createPattern() {
    if (!teamId || !creatingFromBoard) return;
    const res = await fetch(`/api/teams/${teamId}/patterns`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify({ sourceBoardId: creatingFromBoard, name: creatingName.trim() || undefined }),
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); alert(e?.error ?? "Failed to create"); return; }
    const d = await res.json();
    setShowCreate(false); setCreatingFromBoard(""); setCreatingName("");
    router.push(`/app/patterns/${d.pattern.id}`);
  }

  async function deletePattern(p: Pattern) {
    const res = await fetch(`/api/patterns/${p.id}`, {
      method: "DELETE",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); alert(e?.error ?? "Failed to delete"); return; }
    setPatterns(ps => ps.filter(x => x.id !== p.id));
    setConfirmDelete(null);
  }

  async function duplicatePattern(p: Pattern, targetTeamId?: string) {
    const res = await fetch(`/api/patterns/${p.id}/duplicate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(targetTeamId ? { targetTeamId } : {}),
    });
    if (!res.ok) { const e = await res.json().catch(()=>({})); alert(e?.error ?? "Failed to duplicate"); return; }
    const d = await res.json();
    if (!targetTeamId || targetTeamId === teamId) {
      setPatterns(ps => [d.pattern, ...ps]);
    } else {
      alert("Duplicated to other team. Switch teams to view it.");
    }
    setShowDup(null); setDupTargetTeam("");
  }

  return (
    <div style={{padding:24,maxWidth:1280,margin:"0 auto",color:"#f1f5f9"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8,fontSize:13,color:"#64748b"}}>
        <Link href="/app/teams" style={{color:"#64748b",textDecoration:"none"}}>← Teams</Link>
        <span style={{color:BORDER}}>|</span>
        <select
          value={teamId ?? ""}
          onChange={(e) => { setTeamId(e.target.value); router.replace(`/app/patterns?teamId=${e.target.value}`); }}
          style={{background:MID,color:"#f1f5f9",border:`1px solid ${BORDER}`,borderRadius:6,padding:"4px 8px",fontSize:13}}
        >
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24,gap:12,flexWrap:"wrap"}}>
        <div>
          <h1 style={{fontSize:28,fontWeight:800,margin:0,letterSpacing:-0.5}}>Patterns of Play</h1>
          <div style={{color:"#94a3b8",fontSize:14,marginTop:4}}>{patterns.length} {patterns.length === 1 ? "pattern" : "patterns"}</div>
        </div>
        {canEdit && (
          <button
            onClick={() => { setShowCreate(true); setCreatingFromBoard(""); setCreatingName(""); }}
            style={{background:MAROON,color:"#fff",border:"none",borderRadius:8,padding:"10px 16px",fontWeight:700,fontSize:14,cursor:"pointer"}}>
            + New Pattern
          </button>
        )}
      </div>

      {error && <div style={{background:"#7f1630",color:"#fff",padding:12,borderRadius:8,marginBottom:16}}>{error}</div>}
      {loading && <div style={{color:"#94a3b8"}}>Loading…</div>}

      {!loading && patterns.length === 0 && (
        <div style={{background:MID,border:`1px dashed ${BORDER}`,borderRadius:12,padding:48,textAlign:"center"}}>
          <div style={{fontSize:18,fontWeight:700,marginBottom:8}}>No patterns yet</div>
          <div style={{color:"#94a3b8",marginBottom:16}}>Create your first pattern of play from an existing board.</div>
          {canEdit && boards.length > 0 && (
            <button onClick={() => setShowCreate(true)} style={{background:MAROON,color:"#fff",border:"none",borderRadius:8,padding:"10px 16px",fontWeight:700,cursor:"pointer"}}>
              + Create from a board
            </button>
          )}
          {boards.length === 0 && <div style={{color:"#94a3b8",fontSize:13}}>You need at least one board on this team first.</div>}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:20}}>
        {patterns.map(p => (
          <div key={p.id} style={{background:MID,borderRadius:12,border:`1px solid ${BORDER}`,overflow:"hidden",position:"relative",transition:"all 0.15s"}}>
            <Link href={`/app/patterns/${p.id}`} style={{textDecoration:"none",display:"block",padding:"18px 18px 14px"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <div style={{width:36,height:36,borderRadius:8,background:MAROON,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <span style={{color:"#fff",fontWeight:800,fontSize:16}}>▶</span>
                </div>
                <InlineEditable
                  value={p.name}
                  canEdit={canEdit}
                  style={{fontWeight:700,fontSize:16,color:"#f1f5f9",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"inline-block",maxWidth:"100%"}}
                  onSave={async (newName) => {
                    const res = await fetch(`/api/patterns/${p.id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
                      body: JSON.stringify({ name: newName }),
                    });
                    if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err?.error ?? "Failed to rename"); }
                    setPatterns(ps => ps.map(x => x.id === p.id ? { ...x, name: newName } : x));
                  }}
                />
              </div>
              <div style={{color:"#94a3b8",fontSize:12}}>{new Date(p.created_at).toLocaleDateString()}</div>
              <div style={{marginTop:10,color:MAROON,fontSize:12,fontWeight:600}}>Open →</div>
            </Link>
            {canEdit && (<>
              <button onClick={e=>{e.preventDefault();setShowDup(p);setDupTargetTeam(teamId ?? "");}}
                style={{position:"absolute",top:10,right:46,background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:14,padding:"2px 5px",borderRadius:4}}
                title="Duplicate pattern">⎘</button>
              <button onClick={e=>{e.preventDefault();setConfirmDelete(p);}}
                style={{position:"absolute",top:10,right:10,background:"transparent",border:"none",color:"#475569",cursor:"pointer",fontSize:15,padding:"2px 5px",borderRadius:4}}>✕</button>
            </>)}
          </div>
        ))}
      </div>

      {/* Create modal */}
      {showCreate && (
        <Modal onClose={()=>setShowCreate(false)} title="New Pattern of Play">
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label style={{fontSize:12,color:"#94a3b8",display:"block",marginBottom:4}}>Start from board</label>
              <select value={creatingFromBoard} onChange={e=>setCreatingFromBoard(e.target.value)}
                style={{background:DARK,color:"#f1f5f9",border:`1px solid ${BORDER}`,borderRadius:6,padding:"8px 10px",width:"100%",fontSize:14}}>
                <option value="">Pick a board…</option>
                {boards.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <div style={{fontSize:11,color:"#64748b",marginTop:4}}>The pattern copies the board's current state as the starting positions.</div>
            </div>
            <div>
              <label style={{fontSize:12,color:"#94a3b8",display:"block",marginBottom:4}}>Name (optional)</label>
              <input value={creatingName} onChange={e=>setCreatingName(e.target.value)} placeholder="e.g. Build out from the back"
                style={{background:DARK,color:"#f1f5f9",border:`1px solid ${BORDER}`,borderRadius:6,padding:"8px 10px",width:"100%",fontSize:14}}/>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}>
              <button onClick={()=>setShowCreate(false)} style={{background:"transparent",color:"#94a3b8",border:`1px solid ${BORDER}`,borderRadius:6,padding:"8px 14px",cursor:"pointer"}}>Cancel</button>
              <button onClick={createPattern} disabled={!creatingFromBoard}
                style={{background:creatingFromBoard?MAROON:"#475569",color:"#fff",border:"none",borderRadius:6,padding:"8px 14px",cursor:creatingFromBoard?"pointer":"not-allowed",fontWeight:700}}>Create</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Duplicate modal */}
      {showDup && (
        <Modal onClose={()=>setShowDup(null)} title={`Duplicate "${showDup.name}"`}>
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            <div>
              <label style={{fontSize:12,color:"#94a3b8",display:"block",marginBottom:4}}>Target team</label>
              <select value={dupTargetTeam} onChange={e=>setDupTargetTeam(e.target.value)}
                style={{background:DARK,color:"#f1f5f9",border:`1px solid ${BORDER}`,borderRadius:6,padding:"8px 10px",width:"100%",fontSize:14}}>
                {teams.map(t => <option key={t.id} value={t.id}>{t.name}{t.id === teamId ? " (current)" : ""}</option>)}
              </select>
            </div>
            <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:8}}>
              <button onClick={()=>setShowDup(null)} style={{background:"transparent",color:"#94a3b8",border:`1px solid ${BORDER}`,borderRadius:6,padding:"8px 14px",cursor:"pointer"}}>Cancel</button>
              <button onClick={()=>duplicatePattern(showDup, dupTargetTeam)}
                style={{background:MAROON,color:"#fff",border:"none",borderRadius:6,padding:"8px 14px",cursor:"pointer",fontWeight:700}}>Duplicate</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <Modal onClose={()=>setConfirmDelete(null)} title={`Delete "${confirmDelete.name}"?`}>
          <div style={{color:"#cbd5e1",fontSize:14,marginBottom:16}}>This cannot be undone.</div>
          <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
            <button onClick={()=>setConfirmDelete(null)} style={{background:"transparent",color:"#94a3b8",border:`1px solid ${BORDER}`,borderRadius:6,padding:"8px 14px",cursor:"pointer"}}>Cancel</button>
            <button onClick={()=>deletePattern(confirmDelete)} style={{background:"#dc2626",color:"#fff",border:"none",borderRadius:6,padding:"8px 14px",cursor:"pointer",fontWeight:700}}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, title, onClose }: { children: any; title: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}}>
      <div onClick={e=>e.stopPropagation()} style={{background:MID,border:`1px solid ${BORDER}`,borderRadius:12,padding:24,minWidth:340,maxWidth:480,color:"#f1f5f9"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h2 style={{margin:0,fontSize:18,fontWeight:700}}>{title}</h2>
          <button onClick={onClose} style={{background:"transparent",border:"none",color:"#94a3b8",cursor:"pointer",fontSize:20,padding:0,lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function PatternsPage() {
  return (
    <Suspense fallback={<div style={{padding:24,color:"#94a3b8"}}>Loading…</div>}>
      <PatternsInner/>
    </Suspense>
  );
}
