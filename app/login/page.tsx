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
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push("/app/teams");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") handleLogin();
  }

  return (
    <div style={{minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",background:"#0f172a"}}>
      <div style={{background:"#1e293b",borderRadius:12,padding:"40px 36px",width:"100%",maxWidth:400,boxShadow:"0 8px 32px rgba(0,0,0,0.4)"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{fontSize:32,marginBottom:8}}>⚽</div>
          <h1 style={{color:"#f1f5f9",fontSize:24,fontWeight:700,margin:0}}>Lone Peak Soccer</h1>
          <p style={{color:"#64748b",fontSize:14,margin:"8px 0 0"}}>Sign in to your account</p>
        </div>

        {error && (
          <div style={{background:"#7f1d1d",color:"#fca5a5",padding:"10px 14px",borderRadius:8,fontSize:14,marginBottom:16}}>
            {error}
          </div>
        )}

        <div style={{marginBottom:16}}>
          <label style={{display:"block",color:"#94a3b8",fontSize:13,fontWeight:600,marginBottom:6}}>EMAIL</label>
          <input
            type="email"
            value={email}
            onChange={e=>setEmail(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="you@example.com"
            style={{width:"100%",padding:"10px 14px",background:"#0f172a",border:"1px solid #334155",borderRadius:8,color:"#f1f5f9",fontSize:15,outline:"none",boxSizing:"border-box"}}
          />
        </div>

        <div style={{marginBottom:24}}>
          <label style={{display:"block",color:"#94a3b8",fontSize:13,fontWeight:600,marginBottom:6}}>PASSWORD</label>
          <div style={{position:"relative"}}>
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={e=>setPassword(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="••••••••"
              style={{width:"100%",padding:"10px 44px 10px 14px",background:"#0f172a",border:"1px solid #334155",borderRadius:8,color:"#f1f5f9",fontSize:15,outline:"none",boxSizing:"border-box"}}
            />
            <button
              type="button"
              onClick={()=>setShowPw(s=>!s)}
              style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:"#64748b",fontSize:18,padding:0,lineHeight:1}}
              title={showPw ? "Hide password" : "Show password"}
            >
              {showPw ? "🙈" : "👁"}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          style={{width:"100%",padding:"12px",background:loading?"#1e3a5f":"#2563eb",color:"#fff",border:"none",borderRadius:8,fontSize:16,fontWeight:700,cursor:loading?"not-allowed":"pointer",transition:"background 0.2s"}}
        >
          {loading ? "Signing in…" : "Sign In"}
        </button>
      </div>
    </div>
  );
}
