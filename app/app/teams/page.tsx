"use client";
import { useEffect, useState } from "react";
import InlineEditable from "@/lib/InlineEditable";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type TeamRow = { id: string; name: string; created_at: string; };

export default function TeamsPage() {
  const router = useRouter();
  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [roleMap, setRoleMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [boardCounts, setBoardCounts] = useState<Record<string,number>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    setError("");
    const { data: { user } } = await supabase.auth.getUser();
    const { data: sessData } = await supabase.auth.getSession();
    setAccessToken(sessData?.session?.access_token ?? null);
    if (!user) { router.push("/login"); return; }

    // Check admin
    const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", user.id).maybeSingle();
    setIsAdmin(roleData?.role === "admin");

    // Get team memberships
    const { data: memberships, error: memErr } = await supabase
      .from("team_members").select("team_id, role").eq("user_id", user.id);
    if (memErr) { setError(memErr.message); setLoading(false); return; }

    const teamIds = (memberships ?? []).map((m: any) => m.team_id);
    if (teamIds.length === 0) { setTeams([]); setLoading(false); return; }

    const { data: teamData, error: teamErr } = await supabase
      .from("teams").select("id,name,created_at").in("id", teamIds).order("name");
    if (teamErr) { setError(teamErr.message); setLoading(false); return; }
    setTeams(teamData ?? []);
    const rm: Record<string, string> = {};
    for (const m of (memberships ?? []) as any[]) { if (m?.team_id && m?.role) rm[m.team_id] = m.role; }
    setRoleMap(rm);

    // Get board counts per team
    const { data: boardData } = await supabase
      .from("boards").select("id,team_id").in("team_id", teamIds);
    const counts: Record<string,number> = {};
    (boardData ?? []).forEach((b: any) => {
      counts[b.team_id] = (counts[b.team_id] ?? 0) + 1;
    });
    setBoardCounts(counts);
    setLoading(false);
  }

  async function createTeam() {
    if (!newTeamName.trim()) return;
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: sessData } = await supabase.auth.getSession();
    setAccessToken(sessData?.session?.access_token ?? null);
    if (!user) return;
    const { data: team, error: err } = await supabase
      .from("teams").insert({ name: newTeamName.trim() }).select().single();
    if (err) { setError(err.message); setCreating(false); return; }
    await supabase.from("team_members").insert({ team_id: team.id, user_id: user.id, role: "admin" });
    setNewTeamName("");
    setShowCreate(false);
    setCreating(false);
    load();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  const teamInitials = (name: string) => name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();
  const teamColors = ["#1d4ed8","#7c3aed","#0f766e","#b45309","#be123c","#1e3a5f","#4a044e","#14532d"];
  const teamColor = (id: string) => teamColors[id.charCodeAt(0) % teamColors.length];

  return (
    <div style={{minHeight:"100vh",background:"#0d1117",color:"#f1f5f9"}}>
      {/* Header */}
      <div style={{background:"#161b27",borderBottom:"1px solid #7f1630",padding:"0 24px",display:"flex",alignItems:"center",justifyContent:"space-between",height:56}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:22}}>⬡</span>
          <span style={{fontWeight:700,fontSize:18,color:"#f1f5f9"}}>BeSmart Boards</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          {isAdmin && (
            <button onClick={()=>setShowCreate(true)} style={{padding:"7px 16px",background:"#7f1630",color:"#fff",border:"none",borderRadius:7,fontSize:13,fontWeight:600,cursor:"pointer"}}>
              + New Team
            </button>
          )}
          <button onClick={handleLogout} style={{padding:"7px 14px",background:"transparent",color:"#94a3b8",border:"1px solid #334155",borderRadius:7,fontSize:13,cursor:"pointer"}}>
            Sign Out
          </button>
        </div>
      </div>

      <div style={{maxWidth:1100,margin:"0 auto",padding:"32px 20px"}}>
        <h1 style={{fontSize:26,fontWeight:700,color:"#f1f5f9",margin:"0 0 6px"}}>My Teams</h1>
        <p style={{color:"#64748b",fontSize:14,margin:"0 0 28px"}}>Select a team to view its boards</p>

        {!showCreate && (
          <button
            onClick={() => setShowCreate(true)}
            style={{
              marginBottom: 20,
              padding: "8px 16px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            + New Team
          </button>
        )}

        {error && <div style={{background:"#7f1d1d",color:"#fca5a5",padding:"10px 14px",borderRadius:8,fontSize:14,marginBottom:20}}>{error}</div>}

        {loading ? (
          <div style={{display:"flex",gap:16,flexWrap:"wrap"}}>
            {[1,2,3].map(i=>(
              <div key={i} style={{width:280,height:140,background:"#161b27",borderRadius:12,animation:"pulse 1.5s infinite"}}/>
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div style={{textAlign:"center",padding:"60px 20px",background:"#161b27",borderRadius:12}}>
            <div style={{fontSize:48,marginBottom:12}}>🏟️</div>
            <p style={{color:"#94a3b8",fontSize:16}}>You're not a member of any teams yet.</p>
            {isAdmin && <button onClick={()=>setShowCreate(true)} style={{marginTop:16,padding:"10px 24px",background:"#7f1630",color:"#fff",border:"none",borderRadius:8,fontSize:15,fontWeight:600,cursor:"pointer"}}>Create Your First Team</button>}
          </div>
        ) : (
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:20}}>
            {teams.map(team => (
              <Link key={team.id} href={"/app/boards?team=" + team.id} style={{textDecoration:"none"}}>
                <div style={{background:"#161b27",borderRadius:12,padding:24,border:"1px solid #2a1520",cursor:"pointer",transition:"all 0.15s",position:"relative",overflow:"hidden"}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.borderColor="#3b82f6";(e.currentTarget as HTMLElement).style.transform="translateY(-2px)";}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.borderColor="#1e3a5f";(e.currentTarget as HTMLElement).style.transform="translateY(0)";}}>
                  <div style={{position:"absolute",top:0,left:0,right:0,height:4,background:teamColor(team.id),borderRadius:"12px 12px 0 0"}}/>
                  <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:16}}>
                    <div style={{width:48,height:48,borderRadius:12,background:teamColor(team.id),display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,fontWeight:700,color:"#fff",flexShrink:0}}>
                      {teamInitials(team.name)}
                    </div>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:16,color:"#f1f5f9",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}><InlineEditable
                        value={team.name}
                        canEdit={["admin","editor"].includes(roleMap[team.id] ?? "")}
                        style={{fontWeight:700,fontSize:16,color:"#f1f5f9",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}
                        onSave={async (newName) => {
                          const res = await fetch(`/api/teams/${team.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
                            body: JSON.stringify({ name: newName }),
                          });
                          if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err?.error ?? "Failed to rename team"); }
                          setTeams(ts => ts.map(t2 => t2.id === team.id ? { ...t2, name: newName } : t2));
                        }}
                      /></div>
                      <div style={{color:"#64748b",fontSize:12,marginTop:2}}>
                        {boardCounts[team.id] ?? 0} board{(boardCounts[team.id] ?? 0) !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                    <span style={{color:"#3b82f6",fontSize:13,fontWeight:600}}>View Boards →</span>
                    <span style={{color:"#475569",fontSize:11}}>{new Date(team.created_at).getFullYear()}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Create Team Modal */}
      {showCreate && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:100}} onClick={()=>setShowCreate(false)}>
          <div style={{background:"#161b27",borderRadius:14,padding:32,width:"100%",maxWidth:420,border:"1px solid #334155"}} onClick={e=>e.stopPropagation()}>
            <h2 style={{color:"#f1f5f9",fontSize:20,fontWeight:700,margin:"0 0 20px"}}>Create New Team</h2>
            <label style={{display:"block",color:"#94a3b8",fontSize:13,fontWeight:600,marginBottom:6}}>TEAM NAME</label>
            <input
              type="text"
              value={newTeamName}
              onChange={e=>setNewTeamName(e.target.value)}
              onKeyDown={e=>e.key==="Enter" && createTeam()}
              placeholder="e.g. Varsity Boys"
              autoFocus
              style={{width:"100%",padding:"10px 14px",background:"#0d1117",border:"1px solid #334155",borderRadius:8,color:"#f1f5f9",fontSize:15,outline:"none",boxSizing:"border-box",marginBottom:20}}
            />
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setShowCreate(false)} style={{padding:"9px 18px",background:"transparent",color:"#94a3b8",border:"1px solid #334155",borderRadius:8,fontSize:14,cursor:"pointer"}}>Cancel</button>
              <button onClick={createTeam} disabled={creating||!newTeamName.trim()} style={{padding:"9px 20px",background:"#7f1630",color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:600,cursor:creating?"not-allowed":"pointer",opacity:creating?0.7:1}}>
                {creating ? "Creating…" : "Create Team"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
