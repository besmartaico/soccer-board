"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getMyRole } from "@/lib/roles";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!mounted.current) return;
      setEmail(data.user?.email ?? null);
      if (data.user) {
        const role = await getMyRole();
        if (!mounted.current) return;
        setIsAdmin(role === "admin");
      }
    }
    load();
    return () => { mounted.current = false; };
  }, []);

  // Close drawer on navigation
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  function drawerLinkStyle(active: boolean): React.CSSProperties {
    return {
      display: "block",
      color: active ? "#fff" : "#9ca3af",
      textDecoration: "none",
      fontWeight: active ? 700 : 500,
      fontSize: "17px",
      padding: "14px 24px",
      borderLeft: active ? "3px solid #fff" : "3px solid transparent",
      background: active ? "rgba(255,255,255,0.07)" : "transparent",
    };
  }

  return (
    <div>
      {/* ── Desktop nav ── */}
      <nav className="desktop-only bg-[#161b27] border-b border-[#2a1520]-700 px-6 py-3 flex items-center justify-between relative z-40">
        <div className="flex items-center gap-6">
          <span className="font-bold text-lg text-white mr-2">BeSmart Boards</span>
          <Link href="/app/teams" className={`text-sm font-medium ${pathname.startsWith("/app/teams") ? "text-white border-b-2 border-white pb-1" : "text-gray-400 hover:text-white"}`}>Teams</Link>
          <Link href="/app/boards" className={`text-sm font-medium ${pathname.startsWith("/app/boards") ? "text-white border-b-2 border-white pb-1" : "text-gray-400 hover:text-white"}`}>Boards</Link>
          <Link href="/app/patterns" className={`text-sm font-medium ${pathname.startsWith("/app/patterns") ? "text-white border-b-2 border-white pb-1" : "text-gray-400 hover:text-white"}`}>Patterns</Link>
          {isAdmin && <Link href="/app/admin" className={`text-sm font-medium ${pathname.startsWith("/app/admin") ? "text-white border-b-2 border-white pb-1" : "text-gray-400 hover:text-white"}`}>Admin</Link>}
        </div>
        <div className="flex items-center gap-3">
          {email && <span className="text-gray-400 text-sm">{email}</span>}
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
            className="border border-[#2a1520]-600 text-gray-400 px-3 py-1 rounded text-sm hover:bg-dark-700">
            Logout
          </button>
        </div>
      </nav>

      {/* ── Mobile top bar ── */}
      <div className="mobile-only" style={{
        background:"#111", borderBottom:"1px solid #1f1f1f",
        padding:"0 16px", display:"flex", alignItems:"center",
        justifyContent:"space-between", height:"52px",
        position:"sticky", top:0, zIndex:50,
      }}>
        <button onClick={() => setDrawerOpen(true)}
          style={{background:"transparent",border:"none",color:"#fff",fontSize:"22px",cursor:"pointer",padding:"4px 8px",lineHeight:1}}
          aria-label="Open menu">☰</button>
        <span style={{fontWeight:800,fontSize:"15px",color:"#fff"}}>⚽ BeSmart Boards</span>
        <button onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
          style={{background:"transparent",border:"1px solid #333",color:"#9ca3af",padding:"5px 10px",borderRadius:"6px",cursor:"pointer",fontSize:"12px"}}>
          Logout
        </button>
      </div>

      {/* ── Mobile drawer ── */}
      {drawerOpen && (
        <div className="mobile-only" style={{position:"fixed",inset:0,zIndex:200}}>
          <div onClick={() => setDrawerOpen(false)}
            style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.65)"}} />
          <div style={{position:"absolute",left:0,top:0,bottom:0,width:"280px",
            background:"#111",borderRight:"1px solid #1f1f1f",
            display:"flex",flexDirection:"column"}}>
            <div style={{padding:"20px 24px 12px",borderBottom:"1px solid #1f1f1f"}}>
              <div style={{fontWeight:800,fontSize:"17px",color:"#fff"}}>⚽ BeSmart Boards</div>
              {email && <div style={{color:"#6b7280",fontSize:"12px",marginTop:"4px"}}>{email}</div>}
            </div>
            <nav style={{flex:1,paddingTop:"8px"}}>
              <Link href="/app/teams" style={drawerLinkStyle(pathname.startsWith("/app/teams"))}>Teams</Link>
              <Link href="/app/boards" style={drawerLinkStyle(pathname.startsWith("/app/boards"))}>Boards</Link>
            <Link href="/app/patterns" style={drawerLinkStyle(pathname.startsWith("/app/patterns"))}>Patterns</Link>
              {isAdmin && <Link href="/app/admin" style={drawerLinkStyle(pathname.startsWith("/app/admin"))}>Admin</Link>}
            </nav>
          </div>
        </div>
      )}

      <main>{children}</main>
    </div>
  );
}
