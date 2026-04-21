"use client";
import React, { useEffect, useRef, useState } from "react";

export type PlayerPayload = {
  id: string; name: string; grade?: string; returning?: string;
  primary?: string; likelihood?: string; pos1?: string; pos2?: string;
  notes?: string; pictureUrl?: string;
};
export type PlacedPlayer = { id: string; x: number; y: number; w?: number; h?: number; player: PlayerPayload; };
export type BoardTool = "pointer" | "select" | "lane" | "text" | "note" | "token" | "ball";
export type BoardObject = {
  id: string;
  kind: "lane" | "text" | "note" | "token" | "ball";
  x: number; y: number; w: number; h: number;
  title?: string; text?: string; color?: string;
  tokenLabel?: string; tokenColor?: string;
};

function gradeColor(grade?: string): string {
  const g = parseInt((grade ?? "").replace(/[^0-9]/g,""), 10);
  if (g===12) return "#7f1630";
  if (g===11) return "#1a1a1a";
  if (g===10) return "#6b7280";
  if (g===9)  return "#e5e7eb";
  return "#2d3748";
}
function gradeTextColor(grade?: string): string {
  const g = parseInt((grade ?? "").replace(/[^0-9]/g,""), 10);
  return g===9 ? "#111827" : "#ffffff";
}
function uid() { return Math.random().toString(36).slice(2,10); }

type Props = {
  editMode: boolean; objectsLocked?: boolean;
  placed: PlacedPlayer[]; onPlacedChange: (next: PlacedPlayer[]) => void;
  playerDragMime: string; objectDragMime: string;
  backgroundUrl?: string | null;
  onOpenPlayer?: (id: string) => void;
  canvasWidth?: number; canvasHeight?: number;
  objects: BoardObject[]; onObjectsChange: (next: BoardObject[]) => void;
  tool: BoardTool; onToolChange: (t: BoardTool) => void;
  cardSizeMode?: "large" | "medium" | "small";
  onAddPlayerToBoard?: (player: PlayerPayload) => void;
  bgSize?: { w: number; h: number };
  onBgSizeChange?: (s: { w: number; h: number }) => void;
  bgLocked?: boolean;
  onBgLockedChange?: (locked: boolean) => void;
};

const CARD = { large:{w:150,h:120}, medium:{w:120,h:96}, small:{w:96,h:76} };
const MAROON = "#7f1630";
const DARK   = "#0d1117";
const MID    = "#161b27";

export default function HtmlBoard({
  editMode, objectsLocked=false, placed, onPlacedChange,
  playerDragMime, objectDragMime, backgroundUrl,
  onOpenPlayer, canvasWidth=3000, canvasHeight=2000,
  objects, onObjectsChange, tool, onToolChange,
  cardSizeMode="medium", onAddPlayerToBoard,
  bgSize: bgSizeProp,
  onBgSizeChange,
  bgLocked: bgLockedProp,
  onBgLockedChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef    = useRef<HTMLDivElement>(null);
  const [pan,  setPan]  = useState({x:60,y:60});
  const [zoom, setZoom] = useState(0.7);
  const panRef  = useRef(pan);  panRef.current  = pan;
  const zoomRef = useRef(zoom); zoomRef.current = zoom;

  const isPanning    = useRef(false);
  const panStart     = useRef({x:0,y:0,px:0,py:0});
  const movingPlayer = useRef<{id:string;ox:number;oy:number}|null>(null);
  const movingObj    = useRef<{id:string;ox:number;oy:number}|null>(null);
  const resizingObj  = useRef<{id:string;startX:number;startY:number;ow:number;oh:number}|null>(null);
  const resizingBg      = useRef<{startX:number;startY:number;ow:number;oh:number}|null>(null);
  const resizingPlayer  = useRef<{id:string;startX:number;startY:number;ow:number;oh:number}|null>(null);

  const [editingObjId, setEditingObjId] = useState<string|null>(null);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [bgSizeLocal, setBgSizeLocal] = useState({w:1400,h:900});
  const [bgLockedLocal, setBgLockedLocal] = useState(false);
  const bgSize   = bgSizeProp   ?? bgSizeLocal;
  const bgLocked = bgLockedProp ?? bgLockedLocal;
  function setBgSize(s:{w:number,h:number}) { setBgSizeLocal(s); onBgSizeChange?.(s); }
  function setBgLocked(v:boolean) { setBgLockedLocal(v); onBgLockedChange?.(v); }
  const cardSize = CARD[cardSizeMode];

  function clientToCanvas(cx:number,cy:number){
    const r=containerRef.current!.getBoundingClientRect();
    return {x:(cx-r.left-panRef.current.x)/zoomRef.current, y:(cy-r.top-panRef.current.y)/zoomRef.current};
  }

  // ── Scroll to pan, Ctrl+scroll to zoom, BLOCK pinch ─────────────────────
  useEffect(()=>{
    const el=containerRef.current; if(!el) return;
    const onWheel=(e:WheelEvent)=>{
      e.preventDefault();
      if(e.ctrlKey||e.metaKey){
        const f=e.deltaY>0?0.92:1.08;
        setZoom(z=>Math.min(3,Math.max(0.15,z*f)));
      } else {
        setPan(p=>({x:p.x-e.deltaX, y:p.y-e.deltaY}));
      }
    };
    // Block pinch-to-zoom on touch devices
    const blockPinch=(e:TouchEvent)=>{ if(e.touches.length>1) e.preventDefault(); };
    el.addEventListener("wheel",onWheel,{passive:false});
    el.addEventListener("touchstart",blockPinch,{passive:false});
    el.addEventListener("touchmove",blockPinch,{passive:false});
    return()=>{
      el.removeEventListener("wheel",onWheel);
      el.removeEventListener("touchstart",blockPinch);
      el.removeEventListener("touchmove",blockPinch);
    };
  },[]);

  // ── Keyboard delete ───────────────────────────────────────────────────────
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if(!editMode||objectsLocked) return;
      if((e.key==="Delete"||e.key==="Backspace")&&selectedIds.size>0){
        if((e.target as HTMLElement).tagName==="INPUT"||(e.target as HTMLElement).tagName==="TEXTAREA") return;
        onPlacedChange(placed.filter(p=>!selectedIds.has(p.id)));
        onObjectsChange(objects.filter(o=>!selectedIds.has(o.id)));
        setSelectedIds(new Set());
      }
    };
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[editMode,objectsLocked,selectedIds,placed,objects]);

  // ── Canvas pointer events ─────────────────────────────────────────────────
  function onCanvasPointerDown(e:React.PointerEvent){
    if(e.button===2) return;
    const target=e.target as HTMLElement;
    if(target===canvasRef.current||target===containerRef.current){
      if(editMode&&!objectsLocked&&tool!=="pointer"&&tool!=="select"){
        const pos=clientToCanvas(e.clientX,e.clientY);
        if(tool==="lane")       onObjectsChange([...objects,{id:uid(),kind:"lane",x:pos.x-100,y:pos.y-30,w:200,h:60,title:"Lane"}]);
        else if(tool==="text")  onObjectsChange([...objects,{id:uid(),kind:"text",x:pos.x-50,y:pos.y-12,w:100,h:24,text:"Label"}]);
        else if(tool==="note")  onObjectsChange([...objects,{id:uid(),kind:"note",x:pos.x-60,y:pos.y-40,w:120,h:80,text:"Note",color:"#fef08a"}]);
        else if(tool==="token") onObjectsChange([...objects,{id:uid(),kind:"token",x:pos.x-20,y:pos.y-20,w:40,h:40,tokenLabel:"1",tokenColor:MAROON}]);
        else if(tool==="ball")  onObjectsChange([...objects,{id:uid(),kind:"ball",x:pos.x-22,y:pos.y-22,w:44,h:44}]);
        onToolChange("pointer");
        return;
      }
      isPanning.current=true;
      panStart.current={x:e.clientX,y:e.clientY,px:panRef.current.x,py:panRef.current.y};
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      setSelectedIds(new Set());
      return;
    }
  }
  function onCanvasPointerMove(e:React.PointerEvent){
    if(isPanning.current){
      setPan({x:panStart.current.px+(e.clientX-panStart.current.x),y:panStart.current.py+(e.clientY-panStart.current.y)});
      return;
    }
    if(movingPlayer.current&&editMode&&!objectsLocked){
      const pos=clientToCanvas(e.clientX,e.clientY);
      const{id,ox,oy}=movingPlayer.current;
      onPlacedChange(placed.map(p=>p.id===id?{...p,x:pos.x-ox,y:pos.y-oy}:p));
      return;
    }
    if(movingObj.current&&editMode&&!objectsLocked){
      const pos=clientToCanvas(e.clientX,e.clientY);
      const{id,ox,oy}=movingObj.current;
      onObjectsChange(objects.map(o=>o.id===id?{...o,x:pos.x-ox,y:pos.y-oy}:o));
      return;
    }
    if(resizingObj.current&&editMode&&!objectsLocked){
      const pos=clientToCanvas(e.clientX,e.clientY);
      const{id,startX,startY,ow,oh}=resizingObj.current;
      onObjectsChange(objects.map(o=>o.id===id?{...o,w:Math.max(20,ow+(pos.x-startX)),h:Math.max(20,oh+(pos.y-startY))}:o));
      return;
    }
    if(resizingPlayer.current&&editMode&&!objectsLocked){
      const pos=clientToCanvas(e.clientX,e.clientY);
      const{id,startX,startY,ow,oh}=resizingPlayer.current;
      const nw=Math.max(60,ow+(pos.x-startX));
      const nh=Math.max(50,oh+(pos.y-startY));
      onPlacedChange(placed.map(p=>p.id===id?{...p,w:nw,h:nh}:p));
      return;
    }
    if(resizingBg.current&&!bgLocked){
      const pos=clientToCanvas(e.clientX,e.clientY);
      const{startX,startY,ow,oh}=resizingBg.current;
      setBgSize({w:Math.max(200,ow+(pos.x-startX)),h:Math.max(150,oh+(pos.y-startY))});
      return;
    }
  }
  function onCanvasPointerUp(){
    isPanning.current=false;
    movingPlayer.current=null;
    movingObj.current=null;
    resizingObj.current=null;
    resizingBg.current=null;
    resizingPlayer.current=null;
  }

  // ── Drop from roster ──────────────────────────────────────────────────────
  function onCanvasDragOver(e:React.DragEvent){if(!editMode||objectsLocked)return;e.preventDefault();e.dataTransfer.dropEffect="copy";}
  function onCanvasDrop(e:React.DragEvent){
    if(!editMode||objectsLocked)return;e.preventDefault();
    const raw=e.dataTransfer.getData(playerDragMime);if(!raw)return;
    const player:PlayerPayload=JSON.parse(raw);
    const pos=clientToCanvas(e.clientX,e.clientY);
    const existing=placed.find(p=>p.player.id===player.id);
    if(existing) onPlacedChange(placed.map(p=>p.player.id===player.id?{...p,x:pos.x-cardSize.w/2,y:pos.y-cardSize.h/2}:p));
    else onPlacedChange([...placed,{id:uid(),player,x:pos.x-cardSize.w/2,y:pos.y-cardSize.h/2,w:cardSize.w,h:cardSize.h}]);
  }

  // ── Player card pointer ───────────────────────────────────────────────────
  function onPlayerPointerDown(e:React.PointerEvent,pp:PlacedPlayer){
    if(!editMode||objectsLocked)return;e.stopPropagation();
    const pos=clientToCanvas(e.clientX,e.clientY);
    movingPlayer.current={id:pp.id,ox:pos.x-pp.x,oy:pos.y-pp.y};
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if(tool==="select") setSelectedIds(prev=>{const n=new Set(prev);n.has(pp.id)?n.delete(pp.id):n.add(pp.id);return n;});
  }

  // ── Object pointer ────────────────────────────────────────────────────────
  function onObjPointerDown(e:React.PointerEvent,obj:BoardObject){
    if(!editMode||objectsLocked)return;e.stopPropagation();
    const pos=clientToCanvas(e.clientX,e.clientY);
    movingObj.current={id:obj.id,ox:pos.x-obj.x,oy:pos.y-obj.y};
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if(tool==="select") setSelectedIds(prev=>{const n=new Set(prev);n.has(obj.id)?n.delete(obj.id):n.add(obj.id);return n;});
  }
  function onObjResizePointerDown(e:React.PointerEvent,obj:BoardObject){
    if(!editMode||objectsLocked)return;e.stopPropagation();
    const pos=clientToCanvas(e.clientX,e.clientY);
    resizingObj.current={id:obj.id,startX:pos.x,startY:pos.y,ow:obj.w,oh:obj.h};
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  // ── Shared UI helpers ─────────────────────────────────────────────────────
  const delBtn=(id:string,isObj=true)=>editMode&&!objectsLocked?(
    <button onPointerDown={e=>e.stopPropagation()} onClick={()=>isObj?onObjectsChange(objects.filter(o=>o.id!==id)):onPlacedChange(placed.filter(p=>p.id!==id))}
      style={{position:"absolute",top:-7,right:-7,width:18,height:18,borderRadius:"50%",background:"#ef4444",border:"none",color:"#fff",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:20,lineHeight:1,fontWeight:700}}>✕</button>
  ):null;

  // Resize handle — shared for all resizable objects
  const resizeHandle=(obj:BoardObject)=>editMode&&!objectsLocked?(
    <div onPointerDown={e=>onObjResizePointerDown(e,obj)}
      style={{position:"absolute",bottom:0,right:0,width:14,height:14,cursor:"se-resize",background:"rgba(255,255,255,0.3)",borderRadius:"2px 0 4px 0",zIndex:20}}/>
  ):null;

  const cursor=!editMode?"grab":objectsLocked?"default":
    (tool==="lane"||tool==="text"||tool==="note"||tool==="token"||tool==="ball")?"crosshair":"grab";

  return (
    <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",background:DARK,overflow:"hidden"}}>

      {/* ── Zoom bar: − slider + % Reset ── */}
      <div style={{display:"flex",alignItems:"center",gap:8,padding:"5px 14px",background:"#161b27",borderBottom:"1px solid #2a3040",flexShrink:0,userSelect:"none"}}>
        <button onClick={()=>setZoom(z=>Math.max(0.15,z-0.1))}
          style={{width:28,height:28,background:MID,border:"1px solid #2a3040",borderRadius:6,color:"#e2e8f0",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,flexShrink:0}}>−</button>
        <input type="range" min={15} max={200} value={Math.round(zoom*100)}
          onChange={e=>setZoom(+e.target.value/100)}
          style={{flex:1,maxWidth:200,accentColor:MAROON,cursor:"pointer"}}/>
        <button onClick={()=>setZoom(z=>Math.min(3,z+0.1))}
          style={{width:28,height:28,background:MID,border:"1px solid #2a3040",borderRadius:6,color:"#e2e8f0",fontSize:18,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,flexShrink:0}}>+</button>
        <span style={{color:"#64748b",fontSize:11,minWidth:38,textAlign:"center",flexShrink:0}}>{Math.round(zoom*100)}%</span>
        <button onClick={()=>{setZoom(0.7);setPan({x:60,y:60});}}
          style={{padding:"3px 9px",background:MID,border:"1px solid #2a3040",borderRadius:5,color:"#64748b",fontSize:11,cursor:"pointer",flexShrink:0}}>Reset</button>
        <span style={{color:"#2a3040",fontSize:10,flexShrink:0}}>Scroll=pan · Ctrl+scroll=zoom</span>
      </div>

      {/* ── Canvas ── */}
      <div ref={containerRef} style={{flex:1,overflow:"hidden",position:"relative",cursor,userSelect:"none",touchAction:"none"}}
        onPointerDown={onCanvasPointerDown} onPointerMove={onCanvasPointerMove}
        onPointerUp={onCanvasPointerUp} onPointerCancel={onCanvasPointerUp}
        onDragOver={onCanvasDragOver} onDrop={onCanvasDrop}>

        <div ref={canvasRef} style={{position:"absolute",left:pan.x,top:pan.y,width:canvasWidth,height:canvasHeight,
          transform:`scale(${zoom})`,transformOrigin:"0 0"}}>

          {/* Grid dots */}
          {!backgroundUrl&&<div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(circle,#2a3040 1px,transparent 1px)",backgroundSize:"40px 40px",zIndex:0}}/>}

          {/* Background image with resize handle */}
          {backgroundUrl&&(
            <div style={{position:"absolute",left:0,top:0,width:bgSize.w,height:bgSize.h,zIndex:0,overflow:"hidden"}}>
              <img src={backgroundUrl} alt="" style={{width:"100%",height:"100%",objectFit:"fill",display:"block",pointerEvents:"none",userSelect:"none"}}/>
              {editMode&&(
                <>
                  {/* Lock/unlock button */}
                  <button
                    onPointerDown={e=>e.stopPropagation()}
                    onClick={()=>setBgLocked(!bgLocked)}
                    title={bgLocked?"Unlock background size":"Lock background size"}
                    style={{position:"absolute",top:6,right:6,width:28,height:28,background:bgLocked?MAROON:"rgba(0,0,0,0.6)",border:"1px solid rgba(255,255,255,0.3)",borderRadius:6,color:"#fff",fontSize:14,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:10}}>
                    {bgLocked?"🔒":"🔓"}
                  </button>
                  {/* Resize handle — only when not locked */}
                  {!bgLocked&&(
                    <div
                      onPointerDown={e=>{
                        e.stopPropagation();
                        const pos=clientToCanvas(e.clientX,e.clientY);
                        resizingBg.current={startX:pos.x,startY:pos.y,ow:bgSize.w,oh:bgSize.h};
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={e=>{
                        if(!resizingBg.current) return;
                        e.stopPropagation();
                        const pos=clientToCanvas(e.clientX,e.clientY);
                        const{startX,startY,ow,oh}=resizingBg.current;
                        setBgSize({w:Math.max(200,ow+(pos.x-startX)),h:Math.max(150,oh+(pos.y-startY))});
                      }}
                      onPointerUp={()=>{resizingBg.current=null;}}
                      style={{position:"absolute",bottom:0,right:0,width:28,height:28,cursor:"se-resize",
                        background:MAROON,borderRadius:"6px 0 0 0",display:"flex",alignItems:"center",
                        justifyContent:"center",color:"#fff",fontSize:14,zIndex:10,userSelect:"none"}}>⤡</div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Board Objects ── */}
          {objects.map(obj=>{
            const isSel=selectedIds.has(obj.id);
            const base:React.CSSProperties={position:"absolute",left:obj.x,top:obj.y,width:obj.w,height:obj.h,boxSizing:"border-box",outline:isSel?"2px solid #60a5fa":"none",zIndex:5};

            if(obj.kind==="lane") return(
              <div key={obj.id} style={{...base,background:"rgba(127,22,48,0.1)",border:"2px solid rgba(127,22,48,0.5)",borderRadius:8,cursor:editMode&&!objectsLocked?"move":"default"}}
                onPointerDown={e=>onObjPointerDown(e,obj)} onDoubleClick={()=>editMode&&!objectsLocked&&setEditingObjId(obj.id)}>
                {editingObjId===obj.id
                  ?<input autoFocus defaultValue={obj.title} onBlur={e=>{onObjectsChange(objects.map(o=>o.id===obj.id?{...o,title:e.target.value}:o));setEditingObjId(null);}} onKeyDown={e=>e.key==="Enter"&&e.currentTarget.blur()} style={{width:"100%",background:"transparent",border:"none",outline:"none",color:"#e2e8f0",fontWeight:700,fontSize:13,textAlign:"center",padding:"4px 8px"}}/>
                  :<div style={{color:"#e2e8f0",fontWeight:700,fontSize:13,padding:"4px 8px",textAlign:"center",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{obj.title||"Lane"}</div>
                }
                {delBtn(obj.id)}{resizeHandle(obj)}
              </div>
            );

            if(obj.kind==="text") return(
              <div key={obj.id} style={{...base,cursor:editMode&&!objectsLocked?"move":"default",zIndex:6,minWidth:40}}
                onPointerDown={e=>onObjPointerDown(e,obj)} onDoubleClick={()=>editMode&&!objectsLocked&&setEditingObjId(obj.id)}>
                {editingObjId===obj.id
                  ?<input autoFocus defaultValue={obj.text} onBlur={e=>{onObjectsChange(objects.map(o=>o.id===obj.id?{...o,text:e.target.value}:o));setEditingObjId(null);}} style={{background:"transparent",border:"none",outline:"none",color:"#fff",fontWeight:700,fontSize:15,padding:0,width:"100%"}}/>
                  :<div style={{color:"#fff",fontWeight:700,fontSize:15,whiteSpace:"nowrap",textShadow:"0 1px 3px rgba(0,0,0,0.9)"}}>{obj.text||"Label"}</div>
                }
                {delBtn(obj.id)}
              </div>
            );

            if(obj.kind==="note") return(
              <div key={obj.id} style={{...base,background:obj.color||"#fef08a",borderRadius:6,padding:6,cursor:editMode&&!objectsLocked?"move":"default",zIndex:6}}
                onPointerDown={e=>onObjPointerDown(e,obj)} onDoubleClick={()=>editMode&&!objectsLocked&&setEditingObjId(obj.id)}>
                {editingObjId===obj.id
                  ?<textarea autoFocus defaultValue={obj.text} onBlur={e=>{onObjectsChange(objects.map(o=>o.id===obj.id?{...o,text:e.target.value}:o));setEditingObjId(null);}} style={{width:"100%",height:"100%",background:"transparent",border:"none",outline:"none",color:"#1a1a1a",fontSize:12,resize:"none",fontFamily:"inherit"}}/>
                  :<div style={{color:"#1a1a1a",fontSize:12,overflow:"hidden",height:"100%",lineHeight:1.4}}>{obj.text||"Note"}</div>
                }
                {delBtn(obj.id)}{resizeHandle(obj)}
              </div>
            );

            if(obj.kind==="token") return(
              <div key={obj.id} style={{...base,borderRadius:"50%",background:obj.tokenColor||MAROON,display:"flex",alignItems:"center",justifyContent:"center",cursor:editMode&&!objectsLocked?"move":"default",boxShadow:"0 2px 8px rgba(0,0,0,0.5)",border:"2.5px solid rgba(255,255,255,0.35)",zIndex:6}}
                onPointerDown={e=>onObjPointerDown(e,obj)} onDoubleClick={()=>editMode&&!objectsLocked&&setEditingObjId(obj.id)}>
                {editingObjId===obj.id
                  ?<input autoFocus defaultValue={obj.tokenLabel} onBlur={e=>{onObjectsChange(objects.map(o=>o.id===obj.id?{...o,tokenLabel:e.target.value}:o));setEditingObjId(null);}} style={{width:"80%",background:"transparent",border:"none",outline:"none",color:"#fff",fontWeight:800,fontSize:Math.max(10,Math.round(obj.w*0.38)),textAlign:"center",padding:0}}/>
                  :<span style={{color:"#fff",fontWeight:800,fontSize:Math.max(10,Math.round(obj.w*0.38)),userSelect:"none",pointerEvents:"none"}}>{obj.tokenLabel||"1"}</span>
                }
                {delBtn(obj.id)}
                {/* Token resize handle at bottom-right */}
                {editMode&&!objectsLocked&&(
                  <div onPointerDown={e=>onObjResizePointerDown(e,obj)}
                    style={{position:"absolute",bottom:-1,right:-1,width:14,height:14,cursor:"se-resize",background:"rgba(255,255,255,0.4)",borderRadius:"50%",zIndex:20}}/>
                )}
              </div>
            );

            if(obj.kind==="ball") return(
              <div key={obj.id} style={{...base,borderRadius:"50%",overflow:"visible",cursor:editMode&&!objectsLocked?"move":"default",zIndex:6,display:"flex",alignItems:"center",justifyContent:"center",fontSize:Math.round(obj.w*0.82),lineHeight:1}}
                onPointerDown={e=>onObjPointerDown(e,obj)}>
                <span style={{userSelect:"none",pointerEvents:"none"}}>{obj.color||"⚽"}</span>
                {delBtn(obj.id)}
                {/* Ball resize handle */}
                {editMode&&!objectsLocked&&(
                  <div onPointerDown={e=>onObjResizePointerDown(e,obj)}
                    style={{position:"absolute",bottom:-1,right:-1,width:14,height:14,cursor:"se-resize",background:"rgba(255,255,255,0.4)",borderRadius:"50%",zIndex:20}}/>
                )}
              </div>
            );
            return null;
          })}

          {/* ── Placed Player Cards ── */}
          {placed.map(pp=>{
            const bg  = gradeColor(pp.player.grade);
            const fg  = gradeTextColor(pp.player.grade);
            const w   = pp.w ?? cardSize.w;
            const h   = pp.h ?? cardSize.h;
            const isSel = selectedIds.has(pp.id);
            const showPhoto   = cardSizeMode !== "small";
            const showDetails = cardSizeMode === "large";
            const nameBarH    = showPhoto ? Math.round(h * 0.28) : h;
            const photoH      = showPhoto ? h - nameBarH : 0;

            return (
              <div key={pp.id}
                style={{position:"absolute",left:pp.x,top:pp.y,width:w,height:h,
                  background:bg,borderRadius:10,overflow:"hidden",
                  border:isSel?"2.5px solid #60a5fa":"1.5px solid rgba(255,255,255,0.15)",
                  boxShadow:"0 3px 12px rgba(0,0,0,0.55)",
                  cursor:editMode&&!objectsLocked?"move":"default",
                  userSelect:"none",touchAction:"none",zIndex:10}}
                onPointerDown={e=>onPlayerPointerDown(e,pp)}
                onDoubleClick={()=>onOpenPlayer?.(pp.id)}>

                {/* ── Photo area (medium + large) ── */}
                {showPhoto && (
                  <div style={{position:"absolute",top:0,left:0,width:w,height:photoH,overflow:"hidden",
                    background:"rgba(0,0,0,0.2)",cursor:"pointer"}}
                    onClick={e=>{e.stopPropagation();onOpenPlayer?.(pp.id);}}>
                    {pp.player.pictureUrl ? (
                      <img src={pp.player.pictureUrl} alt=""
                        style={{width:"100%",height:"100%",objectFit:"cover",objectPosition:"top center",display:"block",pointerEvents:"none"}}
                        onError={e=>{(e.target as HTMLImageElement).style.display="none";}}/>
                    ) : (
                      <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
                        <span style={{fontSize:Math.round(photoH*0.45),fontWeight:800,color:fg,opacity:0.4,userSelect:"none"}}>
                          {(pp.player.name||"?")[0].toUpperCase()}
                        </span>
                      </div>
                    )}
                    {/* Position badge — top left */}
                    {(pp.player.pos1||pp.player.primary) && (
                      <div style={{position:"absolute",top:4,left:4,background:"rgba(0,0,0,0.6)",color:"#fff",
                        fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:4,lineHeight:1.5,backdropFilter:"blur(2px)"}}>
                        {pp.player.pos1||pp.player.primary}
                      </div>
                    )}
                    {/* Grade badge — top right */}
                    {pp.player.grade && (
                      <div style={{position:"absolute",top:4,right:4,background:"rgba(0,0,0,0.6)",color:"#fff",
                        fontSize:10,fontWeight:700,padding:"1px 5px",borderRadius:4,lineHeight:1.5,backdropFilter:"blur(2px)"}}>
                        {pp.player.grade}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Name bar ── */}
                <div style={{position:"absolute",bottom:0,left:0,width:w,height:nameBarH,
                  background:showPhoto?"rgba(0,0,0,0.55)":bg,
                  display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",
                  padding:"2px 4px",boxSizing:"border-box",overflow:"hidden"}}>
                  <span style={{color:"#ffffff",fontWeight:700,
                    fontSize:Math.max(9, Math.round(nameBarH * (showDetails?0.28:0.38))),
                    lineHeight:1.2,textAlign:"center",overflow:"hidden",
                    textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%",
                    textShadow:"0 1px 3px rgba(0,0,0,0.9)"}}>
                    {pp.player.name}
                  </span>
                  {/* Extra details for large mode */}
                  {showDetails && (
                    <div style={{display:"flex",gap:4,marginTop:2,flexWrap:"wrap",justifyContent:"center"}}>
                      {pp.player.likelihood && (
                        <span style={{color:"#fbbf24",fontSize:9,fontWeight:600,
                          background:"rgba(0,0,0,0.4)",padding:"1px 4px",borderRadius:3}}>
                          ★ {pp.player.likelihood}
                        </span>
                      )}
                      {pp.player.returning && (
                        <span style={{color:"#86efac",fontSize:9,fontWeight:600,
                          background:"rgba(0,0,0,0.4)",padding:"1px 4px",borderRadius:3}}>
                          {pp.player.returning}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Delete button */}
                {editMode&&!objectsLocked&&(
                  <button onPointerDown={e=>e.stopPropagation()}
                    onClick={e=>{e.stopPropagation();onPlacedChange(placed.filter(p=>p.id!==pp.id));}}
                    style={{position:"absolute",top:-7,right:-7,width:20,height:20,borderRadius:"50%",
                      background:"#ef4444",border:"2px solid #fff",color:"#fff",fontSize:11,
                      cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
                      zIndex:20,lineHeight:1,fontWeight:700}}>✕</button>
                )}
                {/* Resize handle */}
                {editMode&&!objectsLocked&&(
                  <div
                    onPointerDown={e=>{
                      e.stopPropagation();
                      const pos=clientToCanvas(e.clientX,e.clientY);
                      resizingPlayer.current={id:pp.id,startX:pos.x,startY:pos.y,ow:w,oh:h};
                      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={e=>{
                      if(!resizingPlayer.current||resizingPlayer.current.id!==pp.id) return;
                      e.stopPropagation();
                      const pos=clientToCanvas(e.clientX,e.clientY);
                      const{startX,startY,ow,oh}=resizingPlayer.current;
                      onPlacedChange(placed.map(p=>p.id===pp.id?{...p,w:Math.max(60,ow+(pos.x-startX)),h:Math.max(50,oh+(pos.y-startY))}:p));
                    }}
                    onPointerUp={()=>{resizingPlayer.current=null;}}
                    style={{position:"absolute",bottom:0,right:0,width:16,height:16,
                      cursor:"se-resize",background:MAROON,borderRadius:"4px 0 8px 0",
                      zIndex:20,display:"flex",alignItems:"center",justifyContent:"center",
                      color:"#fff",fontSize:9,userSelect:"none"}}>⤡</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export { HtmlBoard };
