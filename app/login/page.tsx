"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(""); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push("/app/teams");
  }

  function onKeyDown(e: React.KeyboardEvent) { if (e.key === "Enter") handleLogin(); }

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0d1117"}}>
      <div style={{background:"#161b27",borderRadius:14,padding:"44px 40px",width:"100%",maxWidth:420,boxShadow:"0 8px 40px rgba(0,0,0,0.6)",border:"1px solid #2a3040"}}>
        <div style={{textAlign:"center",marginBottom:36}}>
          <div style={{width:56,height:56,background:"#7f1630",borderRadius:14,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,margin:"0 auto 14px"}}>⬡</div>
          <h1 style={{color:"#f1f5f9",fontSize:22,fontWeight:800,margin:"0 0 6px",letterSpacing:"-0.5px"}}>BeSmart Boards</h1>
          <p style={{color:"#475569",fontSize:13,margin:0}}>Sign in to your account</p>
        </div>

        {error && (
          <div style={{background:"rgba(127,22,48,0.2)",color:"#fca5a5",padding:"10px 14px",borderRadius:8,fontSize:13,marginBottom:16,border:"1px solid rgba(127,22,48,0.4)"}}>
            {error}
          </div>
        )}

        <div style={{marginBottom:16}}>
          <label style={{display:"block",color:"#64748b",fontSize:11,fontWeight:700,marginBottom:6,letterSpacing:"0.08em"}}>EMAIL</label>
          <input type="email" value={email} onChange={e=>setEmail(e.target.value)} onKeyDown={onKeyDown}
            placeholder="you@example.com" autoComplete="email"
            style={{width:"100%",padding:"10px 14px",background:"#0d1117",border:"1px solid #2a3040",borderRadius:8,color:"#f1f5f9",fontSize:15,outline:"none",boxSizing:"border-box"}}/>
        </div>

        <div style={{marginBottom:28}}>
          <label style={{display:"block",color:"#64748b",fontSize:11,fontWeight:700,marginBottom:6,letterSpacing:"0.08em"}}>PASSWORD</label>
          <div style={{position:"relative"}}>
            <input type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={onKeyDown}
              placeholder="••••••••" autoComplete="current-password"
              style={{width:"100%",padding:"10px 44px 10px 14px",background:"#0d1117",border:"1px solid #2a3040",borderRadius:8,color:"#f1f5f9",fontSize:15,outline:"none",boxSizing:"border-box"}}/>
            <button type="button" onClick={()=>setShowPw(s=>!s)}
              style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#64748b",fontSize:17,padding:0,lineHeight:1}}>
              {showPw?"🙈":"👁"}
            </button>
          </div>
        </div>

        <button type="button" onClick={handleLogin} disabled={loading}
          style={{width:"100%",padding:"12px",background:loading?"#4a0e1c":"#7f1630",color:"#fff",border:"none",borderRadius:8,fontSize:15,fontWeight:700,cursor:loading?"not-allowed":"pointer",transition:"background 0.2s",letterSpacing:"0.02em"}}>
          {loading?"Signing in…":"Sign In"}
        </button>

        <p style={{textAlign:"center",color:"#334155",fontSize:11,marginTop:24,marginBottom:0}}>
          team.besmartai.co
        </p>
      </div>
    </div>
  );
}
