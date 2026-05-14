"use client";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { HtmlBoard, type PlacedPlayer, type BoardObject, type BoardTool, type PlayerPayload } from "@/lib/board/HtmlBoard";

const PLAYER_DRAG_MIME = "application/x-lp-player";
const OBJECT_DRAG_MIME = "application/x-lp-object";
const BG_BUCKET        = "board-backgrounds";
const MAROON           = "#7f1630";
const DARK             = "#0d1117";
const MID              = "#161b27";
const BORDER           = "#2a1520";

type BoardRow  = { id: string; name: string; team_id: string; data: any; };
type PlayerRow = { id: string; name: string; grade: string; position: string;
  secondaryPosition: string; returning: string; likelihoodPrimary: string;
  potentialPrimary: string; notes: string; picture: string; pictureProxyUrl?: string; };
type GoogleConfig = { sheetId: string; range: string; };

function rowToPayload(p: PlayerRow): PlayerPayload {
  return { id:p.id, name:p.name, grade:p.grade, pos1:p.position, pos2:p.secondaryPosition,
    likelihood:p.likelihoodPrimary, notes:p.notes, pictureUrl:p.picture||p.pictureProxyUrl };
}
function gradeColor(g?: string) {
  const n=parseInt((g||"").replace(/[^0-9]/g,""),10);
  if(n===12) return MAROON; if(n===11) return "#1a1a1a";
  if(n===10) return "#6b7280"; if(n===9) return "#e5e7eb"; return "#2d3748";
}
function gradeText(g?: string) {
  return parseInt((g||"").replace(/[^0-9]/g,""),10)===9?"#111827":"#fff";
}

export default function BoardPage() {
  const params  = useParams();
  const router  = useRouter();
  const boardId = Array.isArray(params.boardId)?params.boardId[0]:(params.boardId??"");

  const [board,         setBoard]         = useState<BoardRow|null>(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string|null>(null);
  const [myRole,        setMyRole]        = useState("viewer");
  const [editMode,      setEditMode]      = useState(false);
  const [objectsLocked, setObjectsLocked] = useState(false);
  const [dirty,         setDirty]         = useState(false);
  const [saving,        setSaving]        = useState(false);

  const [placedPlayers, setPlacedPlayers] = useState<PlacedPlayer[]>([]);
  const [boardObjects,  setBoardObjects]  = useState<BoardObject[]>([]);
  const [backgroundUrl, setBackgroundUrl] = useState<string|null>(null);
  const [cardSizeMode,  setCardSizeMode]  = useState<"large"|"medium"|"small"|"x-small">("medium");
  const [bgSize,        setBgSize]        = useState<{w:number;h:number}>({w:1400,h:900});
  const [bgLocked,      setBgLocked]      = useState(false);
  const [tool,          setTool]          = useState<BoardTool>("pointer");

  const [googleConfig,    setGoogleConfig]    = useState<GoogleConfig|null>(null);
  const [players,         setPlayers]         = useState<PlayerRow[]>([]);
  const [playersLoading,  setPlayersLoading]  = useState(false);
  const [playersError,    setPlayersError]    = useState("");
  const [sidebarOpen,     setSidebarOpen]     = useState(true);
  const [searchQuery,     setSearchQuery]     = useState("");
  const [gradeFilter,     setGradeFilter]     = useState("all");
  const [openedPlayerId,  setOpenedPlayerId]  = useState<string|null>(null);

  const [showSheetEdit,   setShowSheetEdit]   = useState(false);
  const [sheetIdInput,    setSheetIdInput]    = useState("");
  const [sheetRangeInput, setSheetRangeInput] = useState("Sheet1!A:I");

  const bgInputRef = useRef<HTMLInputElement>(null);

  useEffect(()=>{ if(boardId) loadBoard(); },[boardId]);

  async function loadBoard() {
    setLoading(true); setError(null);
    const { data:{session} } = await supabase.auth.getSession();
    if(!session){ router.push("/login"); return; }
    const res = await fetch(`/api/boards/${boardId}`,{headers:{Authorization:`Bearer ${session.access_token}`}});
    const json = await res.json().catch(()=>({}));
    if(!res.ok||!json?.success){ setError(json?.error??"Failed to load board"); setLoading(false); return; }
    const row:BoardRow=json.board; const role:string=json.role??"viewer";
    setMyRole(role); setEditMode(role==="admin"||role==="editor"); setBoard(row);
    const hb=row?.data?.htmlBoard??{};
    setPlacedPlayers(hb.placed??[]); setBoardObjects(hb.objects??[]);
    setBackgroundUrl(hb.backgroundUrl??null); setCardSizeMode(hb.cardSizeMode??"medium");
    if(hb.bgSize) setBgSize(hb.bgSize);
    if(hb.bgLocked!==undefined) setBgLocked(hb.bgLocked);
    const gc=row?.data?.googleConfig;
    if(gc?.sheetId&&gc?.range) setGoogleConfig({sheetId:gc.sheetId,range:gc.range});
    setLoading(false);
  }

  useEffect(()=>{ if(googleConfig) loadPlayers(); },[googleConfig]);

  async function loadPlayers() {
    if(!googleConfig) return;
    setPlayersLoading(true); setPlayersError("");
    const {data:{session}}=await supabase.auth.getSession();
    if(!session) return;
    try {
      const res=await fetch(`/api/google/sheet?sheetId=${encodeURIComponent(googleConfig.sheetId)}&range=${encodeURIComponent(googleConfig.range)}`,
        {headers:{Authorization:`Bearer ${session.access_token}`}});
      const json=await res.json().catch(()=>({}));
      if(!res.ok){ setPlayersError(json?.error??"Failed to load roster"); return; }
      const rows:string[][]=json.values??[];
      if(rows.length<2){ setPlayers([]); return; }
      const headers=rows[0].map((h:string)=>h.toLowerCase().trim());
      const col=(n:string)=>headers.indexOf(n);
      const parsed:PlayerRow[]=rows.slice(1).filter(r=>r.some(c=>c?.trim())).map(r=>({
        id:r[col("id")]??r[0]??Math.random().toString(36).slice(2),
        name:r[col("name")]??r[1]??"", grade:r[col("grade")]??r[2]??"",
        position:r[col("position")]??r[3]??"", secondaryPosition:r[col("secondaryposition")]??r[4]??"",
        returning:r[col("returning")]??r[5]??"", likelihoodPrimary:r[col("likelihood")]??r[6]??"",
        potentialPrimary:r[col("potential")]??r[7]??"", notes:r[col("notes")]??r[8]??"",
        picture:r[col("picture")]??r[9]??"",
      }));
      setPlayers(parsed);
    } catch(e:any){ setPlayersError(e?.message??"Error"); } finally { setPlayersLoading(false); }
  }

  function getBoardData(bg?:string, bgs?:{w:number;h:number}, bgl?:boolean) {
    return { ...board?.data,
      htmlBoard:{ placed:placedPlayers, objects:boardObjects,
        backgroundUrl:bg??backgroundUrl, cardSizeMode,
        bgSize:bgs??bgSize, bgLocked:bgl??bgLocked },
      googleConfig };
  }

  async function saveBoard() {
    if(!board) return; setSaving(true);
    const {error:err}=await supabase.from("boards").update({data:getBoardData()}).eq("id",boardId);
    if(err) setError(err.message); else setDirty(false);
    setSaving(false);
  }

  async function onBgFileChange(e:React.ChangeEvent<HTMLInputElement>) {
    const file=e.target.files?.[0]; if(!file) return; setSaving(true);
    const ext=file.name.split(".").pop();
    const path=`${boardId}/bg.${ext}`;
    const {error:upErr}=await supabase.storage.from(BG_BUCKET).upload(path,file,{upsert:true});
    if(upErr){ setError(upErr.message); setSaving(false); return; }
    const {data:{publicUrl}}=supabase.storage.from(BG_BUCKET).getPublicUrl(path);
    setBackgroundUrl(publicUrl);
    if(board) {
      const {error:saveErr}=await supabase.from("boards")
        .update({data:getBoardData(publicUrl)}).eq("id",boardId);
      if(saveErr) setError(saveErr.message); else setDirty(false);
    }
    setSaving(false);
  }

  function updatePlaced(next:PlacedPlayer[]){ setPlacedPlayers(next); setDirty(true); }
  function updateObjects(next:BoardObject[]){ setBoardObjects(next); setDirty(true); }

  function onPlayerDragStart(e:React.DragEvent,p:PlayerRow){
    e.dataTransfer.setData(PLAYER_DRAG_MIME,JSON.stringify(rowToPayload(p)));
    e.dataTransfer.effectAllowed="copy";
  }
  function addPlayerToBoard(payload:PlayerPayload){
    if(placedPlayers.find(pp=>pp.player.id===payload.id)) return;
    updatePlaced([...placedPlayers,{id:Math.random().toString(36).slice(2),player:payload,
      x:80+placedPlayers.length*12, y:80+placedPlayers.length*12}]);
  }
  function saveSheetConfig(){
    if(!sheetIdInput.trim()) return;
    setGoogleConfig({sheetId:sheetIdInput.trim(),range:sheetRangeInput.trim()||"Sheet1!A:I"});
    setShowSheetEdit(false); setDirty(true);
  }

  const filteredPlayers=players.filter(p=>{
    const mq=!searchQuery||p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const mg=gradeFilter==="all"||p.grade===gradeFilter;
    return mq&&mg;
  });
  const allGrades=[...new Set(players.map(p=>p.grade).filter(Boolean))].sort();
  const canEdit=myRole==="admin"||myRole==="editor";
  const tb=(active:boolean,color=MAROON)=>({
    padding:"5px 10px",borderRadius:6,fontSize:11,fontWeight:600,
    background:active?color:MID, color:active?"#fff":"#94a3b8",
    border:`1px solid ${active?color:BORDER}`, cursor:"pointer",
    whiteSpace:"nowrap" as const, flexShrink:0,
  });
  if(loading) return <div style={{minHeight:"100vh",background:DARK,display:"flex",alignItems:"center",justifyContent:"center",color:"#64748b"}}>Loading…</div>;
  if(error&&!board) return <div style={{minHeight:"100vh",background:DARK,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:12}}><div style={{color:"#f87171"}}>{error}</div><Link href="/app/teams" style={{color:"#3b82f6"}}>← Back</Link></div>;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100vh",background:DARK,overflow:"hidden"}}>

      {/* ── Toolbar ── */}
      <div style={{display:"flex",alignItems:"center",gap:4,padding:"5px 10px",background:MID,borderBottom:`1px solid ${BORDER}`,overflowX:"auto",flexShrink:0,scrollbarWidth:"none" as any}}>
        <Link href={`/app/boards?team=${board?.team_id}`} style={{color:"#64748b",textDecoration:"none",fontSize:12,flexShrink:0}}>←</Link>
        <span style={{color:"#e8a0b0",fontWeight:700,fontSize:13,flexShrink:0,maxWidth:130,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{board?.name}</span>
        <div style={{width:1,height:18,background:BORDER,flexShrink:0,margin:"0 2px"}}/>
        {canEdit&&<button onClick={saveBoard} disabled={saving} style={tb(dirty,"#1d4ed8")}>{saving?"Saving…":dirty?"● Save":"✓ Saved"}</button>}
        {canEdit&&<button onClick={()=>setEditMode(m=>!m)} style={tb(editMode,"#dc2626")}>{editMode?"✏ Editing":"✏ Edit"}</button>}
        <button onClick={()=>{loadBoard();if(googleConfig)loadPlayers();}} style={tb(false)}>↻</button>
        <div style={{width:1,height:18,background:BORDER,flexShrink:0,margin:"0 2px"}}/>
        {editMode&&!objectsLocked&&<>
          <button onClick={()=>setTool(t=>t==="select"?"pointer":"select")} style={tb(tool==="select")}>⬚ Sel</button>
          <button onClick={()=>setTool(t=>t==="lane"?"pointer":"lane")} style={tb(tool==="lane")}>▦ Lane</button>
          <button onClick={()=>setTool(t=>t==="text"?"pointer":"text")} style={tb(tool==="text")}>T Text</button>
          <button onClick={()=>setTool(t=>t==="note"?"pointer":"note")} style={tb(tool==="note")}>📝 Note</button>
          <button onClick={()=>setTool(t=>t==="token"?"pointer":"token")} style={tb(tool==="token")}>⬤ Token</button>
          <button onClick={()=>setTool(t=>t==="ball"?"pointer":"ball")} style={tb(tool==="ball")}>⚽ Ball</button>
          <div style={{width:1,height:18,background:BORDER,flexShrink:0,margin:"0 2px"}}/>
        </>}
        {canEdit&&<button onClick={()=>{setObjectsLocked(l=>!l);setTool("pointer");}} style={tb(objectsLocked,"#b45309")}>{objectsLocked?"🔒":"🔓"}</button>}
        <div style={{width:1,height:18,background:BORDER,flexShrink:0,margin:"0 2px"}}/>
        <select value={cardSizeMode} onChange={e=>{
          const mode = e.target.value as "large"|"medium"|"small"|"x-small";
          setCardSizeMode(mode);
          // Clear all individual card sizes so they snap to the new mode's defaults
          setPlacedPlayers(prev => prev.map(pp => ({...pp, w:undefined, h:undefined})));
          setDirty(true);
        }}
          style={{padding:"4px 6px",background:MID,color:"#94a3b8",border:`1px solid ${BORDER}`,borderRadius:6,fontSize:11,cursor:"pointer",flexShrink:0}}>
          <option value="x-small">XS: Name</option>
          <option value="small">S: Photo+Name</option>
          <option value="medium">M: Photo+Name</option>
          <option value="large">L: Full</option>
        </select>
        {canEdit&&<><button onClick={()=>bgInputRef.current?.click()} style={tb(false)}>🖼 BG</button>
        {backgroundUrl&&<button onClick={()=>{setBackgroundUrl(null);setDirty(true);}} style={tb(false)}>✕BG</button>}
        <input ref={bgInputRef} type="file" accept="image/*" style={{display:"none"}} onChange={onBgFileChange}/></>}
        {canEdit&&<button onClick={()=>{setSheetIdInput(googleConfig?.sheetId??"");setSheetRangeInput(googleConfig?.range??"Sheet1!A:I");setShowSheetEdit(true);}} style={tb(!!googleConfig,"#059669")}>📊 Sheet</button>}
      </div>

      {/* ── Body ── */}
      <div style={{flex:1,display:"flex",overflow:"hidden",minHeight:0}}>

        {/* Roster sidebar */}
        {sidebarOpen ? (
          <div style={{width:220,flexShrink:0,background:MID,borderRight:`1px solid ${BORDER}`,display:"flex",flexDirection:"column",overflow:"hidden",position:"relative"}}>
            {/* Collapse button */}
            <button onClick={()=>setSidebarOpen(false)} title="Collapse"
              style={{position:"absolute",top:6,right:6,zIndex:10,width:22,height:22,background:DARK,border:`1px solid ${BORDER}`,borderRadius:5,color:"#64748b",cursor:"pointer",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center"}}>◀</button>
            {/* Search + filter */}
            <div style={{padding:"8px 10px 6px",borderBottom:`1px solid ${BORDER}`,flexShrink:0}}>
              <input type="text" placeholder="Search players…" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                style={{width:"100%",padding:"6px 10px",background:DARK,border:`1px solid ${BORDER}`,borderRadius:6,color:"#f1f5f9",fontSize:12,outline:"none",boxSizing:"border-box" as const}}/>
              <select value={gradeFilter} onChange={e=>setGradeFilter(e.target.value)}
                style={{marginTop:5,width:"100%",padding:"5px 8px",background:DARK,border:`1px solid ${BORDER}`,borderRadius:6,color:"#94a3b8",fontSize:11,outline:"none"}}>
                <option value="all">All Grades</option>
                {allGrades.map(g=><option key={g} value={g}>Grade {g}</option>)}
              </select>
            </div>
            {/* Player list */}
            <div style={{flex:1,overflowY:"auto",padding:"6px 8px"}}>
              {!googleConfig ? (
                <div style={{padding:"16px 8px",textAlign:"center"}}>
                  <p style={{color:"#64748b",fontSize:12,margin:"0 0 8px"}}>No roster configured.</p>
                  {canEdit&&<button onClick={()=>setShowSheetEdit(true)} style={{padding:"6px 12px",background:"#059669",color:"#fff",border:"none",borderRadius:6,fontSize:12,cursor:"pointer"}}>Add Sheet</button>}
                </div>
              ) : playersLoading ? <div style={{padding:16,color:"#64748b",fontSize:12,textAlign:"center"}}>Loading…</div>
              : playersError ? <div style={{padding:12,color:"#f87171",fontSize:12}}>{playersError}</div>
              : filteredPlayers.length===0 ? <div style={{padding:16,color:"#64748b",fontSize:12,textAlign:"center"}}>No players</div>
              : filteredPlayers.map(p=>{
                const bg=gradeColor(p.grade); const fg=gradeText(p.grade);
                const onBoard=placedPlayers.some(pp=>pp.player.id===p.id);
                return (
                  <div key={p.id} draggable={editMode&&!objectsLocked} onDragStart={e=>onPlayerDragStart(e,p)}
                    style={{display:"flex",alignItems:"center",gap:7,padding:"5px 7px",marginBottom:4,background:bg,
                      borderRadius:8,cursor:editMode&&!objectsLocked?"grab":"default",opacity:onBoard?0.45:1,
                      border:"1px solid rgba(255,255,255,0.08)"}}>
                    <div style={{width:30,height:30,borderRadius:"50%",background:"rgba(0,0,0,0.2)",overflow:"hidden",flexShrink:0}}>
                      {p.picture&&<img src={p.picture} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{color:fg,fontWeight:700,fontSize:11,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                      <div style={{color:fg,fontSize:10,opacity:0.7}}>{p.position}{p.grade?" · Gr."+p.grade:""}</div>
                    </div>
                    {editMode&&!objectsLocked&&!onBoard&&<button onClick={()=>addPlayerToBoard(rowToPayload(p))}
                      style={{flexShrink:0,width:20,height:20,borderRadius:"50%",background:"rgba(255,255,255,0.2)",border:"none",color:fg,fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>+</button>}
                    {onBoard&&<span style={{color:fg,fontSize:10,opacity:0.5,flexShrink:0}}>✓</span>}
                  </div>
                );
              })}
            </div>
            {googleConfig&&<div style={{padding:"6px 10px",borderTop:`1px solid ${BORDER}`,flexShrink:0}}>
              <button onClick={loadPlayers} style={{width:"100%",padding:"6px",background:DARK,color:"#64748b",border:`1px solid ${BORDER}`,borderRadius:6,fontSize:11,cursor:"pointer"}}>↻ Reload Roster</button>
            </div>}
          </div>
        ) : (
          /* Collapsed sidebar tab */
          <button onClick={()=>setSidebarOpen(true)} title="Show roster"
            style={{width:26,flexShrink:0,background:MID,border:"none",borderRight:`1px solid ${BORDER}`,
              color:"#64748b",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>▶</button>
        )}

        {/* Board canvas */}
        <div style={{flex:1,minWidth:0,overflow:"hidden",position:"relative"}}>
          {error&&<div style={{position:"absolute",top:8,left:"50%",transform:"translateX(-50%)",background:"rgba(127,22,48,0.9)",color:"#fca5a5",padding:"6px 14px",borderRadius:7,fontSize:12,zIndex:50}}>{error}</div>}
          <HtmlBoard
            editMode={editMode} objectsLocked={objectsLocked}
            placed={placedPlayers} onPlacedChange={updatePlaced}
            objects={boardObjects} onObjectsChange={updateObjects}
            tool={tool} onToolChange={setTool}
            cardSizeMode={cardSizeMode}
            playerDragMime={PLAYER_DRAG_MIME} objectDragMime={OBJECT_DRAG_MIME}
            backgroundUrl={backgroundUrl}
            bgSize={bgSize} onBgSizeChange={(s)=>{setBgSize(s);setDirty(true);}}
            bgLocked={bgLocked} onBgLockedChange={(v)=>{setBgLocked(v);setDirty(true);}}
            onOpenPlayer={(id)=>setOpenedPlayerId(id)}
            onAddPlayerToBoard={addPlayerToBoard}
          />
        </div>
      </div>

      {/* ── Player Detail Modal ── */}
      {openedPlayerId&&(()=>{
        const pp=placedPlayers.find(p=>p.id===openedPlayerId);
        if(!pp){setOpenedPlayerId(null);return null;}
        const p=pp.player;
        const bg=gradeColor(p.grade); const fg=gradeText(p.grade);
        return (
          <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.82)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:300,padding:20}} onClick={()=>setOpenedPlayerId(null)}>
            <div style={{background:MID,borderRadius:16,width:"100%",maxWidth:420,border:`1px solid ${BORDER}`,overflow:"hidden",boxShadow:"0 24px 64px rgba(0,0,0,0.7)"}} onClick={e=>e.stopPropagation()}>
              <div style={{position:"relative",background:"#000",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",minHeight:200,maxHeight:480}}>
                {p.pictureUrl
                  ?<img src={p.pictureUrl} alt="" style={{width:"100%",height:"auto",maxHeight:480,objectFit:"contain",display:"block"}} onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
                  :<div style={{width:"100%",height:230,display:"flex",alignItems:"center",justifyContent:"center",background:bg}}><span style={{fontSize:100,fontWeight:800,color:fg,opacity:0.25}}>{(p.name||"?")[0].toUpperCase()}</span></div>
                }
                <button onClick={()=>setOpenedPlayerId(null)} style={{position:"absolute",top:10,right:10,width:30,height:30,borderRadius:"50%",background:"rgba(0,0,0,0.6)",border:"none",color:"#fff",fontSize:15,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
                {p.grade&&<div style={{position:"absolute",top:10,left:10,background:bg,color:fg,fontSize:11,fontWeight:700,padding:"2px 9px",borderRadius:5,border:"1px solid rgba(255,255,255,0.2)"}}>Gr. {p.grade}</div>}
              </div>
              <div style={{padding:"18px 22px"}}>
                <h2 style={{color:"#f1f5f9",fontSize:21,fontWeight:800,margin:"0 0 3px"}}>{p.name}</h2>
                <p style={{color:"#64748b",fontSize:13,margin:"0 0 14px"}}>{[p.pos1||p.primary,p.pos2].filter(Boolean).join(" / ")}</p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {([["Position",p.pos1||p.primary],["2nd Pos",p.pos2],["Returning",p.returning],["Likelihood",p.likelihood]] as [string,string|undefined][]).filter(([,v])=>v).map(([label,val])=>(
                    <div key={label} style={{background:DARK,borderRadius:7,padding:"7px 10px"}}>
                      <div style={{color:"#475569",fontSize:10,fontWeight:600,marginBottom:1,letterSpacing:"0.05em"}}>{label.toUpperCase()}</div>
                      <div style={{color:"#e2e8f0",fontSize:13,fontWeight:600}}>{val}</div>
                    </div>
                  ))}
                </div>
                {p.notes&&<div style={{marginTop:10,background:DARK,borderRadius:7,padding:"9px 10px"}}>
                  <div style={{color:"#475569",fontSize:10,fontWeight:600,marginBottom:3,letterSpacing:"0.05em"}}>NOTES</div>
                  <div style={{color:"#94a3b8",fontSize:12,lineHeight:1.5}}>{p.notes}</div>
                </div>}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Sheet Config Modal ── */}
      {showSheetEdit&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:200,padding:20}} onClick={()=>setShowSheetEdit(false)}>
          <div style={{background:MID,borderRadius:14,padding:28,width:"100%",maxWidth:460,border:`1px solid ${BORDER}`}} onClick={e=>e.stopPropagation()}>
            <h3 style={{color:"#f1f5f9",fontSize:18,fontWeight:700,margin:"0 0 18px"}}>📊 Google Sheet Roster</h3>
            <label style={{display:"block",color:"#64748b",fontSize:11,fontWeight:600,marginBottom:5,letterSpacing:"0.06em"}}>GOOGLE SHEETS URL OR ID</label>
            <input type="text" value={sheetIdInput} onChange={e=>setSheetIdInput(e.target.value)}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              style={{width:"100%",padding:"9px 12px",background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:"#f1f5f9",fontSize:13,outline:"none",boxSizing:"border-box" as const,marginBottom:12}}/>
            <label style={{display:"block",color:"#64748b",fontSize:11,fontWeight:600,marginBottom:5,letterSpacing:"0.06em"}}>RANGE</label>
            <input type="text" value={sheetRangeInput} onChange={e=>setSheetRangeInput(e.target.value)}
              placeholder="Sheet1!A:I"
              style={{width:"100%",padding:"9px 12px",background:DARK,border:`1px solid ${BORDER}`,borderRadius:7,color:"#f1f5f9",fontSize:13,outline:"none",boxSizing:"border-box" as const,marginBottom:16}}/>
            <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
              <button onClick={()=>setShowSheetEdit(false)} style={{padding:"9px 18px",background:"transparent",color:"#94a3b8",border:`1px solid ${BORDER}`,borderRadius:8,fontSize:14,cursor:"pointer"}}>Cancel</button>
              <button onClick={saveSheetConfig} disabled={!sheetIdInput.trim()} style={{padding:"9px 20px",background:sheetIdInput.trim()?"#059669":BORDER,color:"#fff",border:"none",borderRadius:8,fontSize:14,fontWeight:700,cursor:"pointer"}}>Save & Load</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
