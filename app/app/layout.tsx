"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getMyRole } from "@/lib/roles";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (user) {
        setUserEmail(user.email ?? null);
        getMyRole().then(r => setRole(r));
      }
    });
  }, []);

  // Close drawer on navigation
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  const navLinks = (
    <>
      <Link href="/app/teams" style={linkStyle(pathname.startsWith("/app/teams"))}>Teams</Link>
      <Link href="/app/boards" style={linkStyle(pathname.startsWith("/app/boards"))}>Boards</Link>
      {role === "admin" && (
        <Link href="/app/admin" style={linkStyle(pathname.startsWith("/app/admin"))}>Admin</Link>
      )}
    </>
  );

  function linkStyle(active: boolean) {
    return {
      color: active ? "#fff" : "#9ca3af",
      textDecoration: "none",
      fontWeight: active ? 700 : 400,
      fontSize: "15px",
      padding: "8px 4px",
      borderBottom: active ? "2px solid #fff" : "2px solid transparent",
    } as React.CSSProperties;
  }

  function drawerLinkStyle(active: boolean) {
    return {
      display: "block",
      color: active ? "#fff" : "#9ca3af",
      textDecoration: "none",
      fontWeight: active ? 700 : 500,
      fontSize: "17px",
      padding: "14px 24px",
      borderLeft: active ? "3px solid #fff" : "3px solid transparent",
      background: active ? "rgba(255,255,255,0.07)" : "transparent",
    } as React.CSSProperties;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#fff" }}>

      {/* ── Desktop top nav ── */}
      <nav className="desktop-only" style={{
        background: "#111",
        borderBottom: "1px solid #1f1f1f",
        padding: "0 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "52px",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <span style={{ fontWeight: 800, fontSize: "16px", color: "#fff", marginRight: "8px" }}>
            ⚽ Lone Peak Soccer
          </span>
          {navLinks}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {userEmail && <span style={{ color: "#6b7280", fontSize: "13px" }}>{userEmail}</span>}
          <button
            onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
            style={{ background: "transparent", border: "1px solid #333", color: "#9ca3af", padding: "5px 12px", borderRadius: "6px", cursor: "pointer", fontSize: "13px" }}
          >
            Logout
          </button>
        </div>
      </nav>

      {/* ── Mobile top bar ── */}
      <div className="mobile-only" style={{
        background: "#111",
        borderBottom: "1px solid #1f1f1f",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "52px",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}>
        <button
          onClick={() => setDrawerOpen(true)}
          style={{ background: "transparent", border: "none", color: "#fff", fontSize: "22px", cursor: "pointer", padding: "4px 8px", lineHeight: 1 }}
          aria-label="Open menu"
        >
          ☰
        </button>
        <span style={{ fontWeight: 800, fontSize: "15px", color: "#fff" }}>⚽ LP Soccer</span>
        <button
          onClick={async () => { await supabase.auth.signOut(); window.location.href = "/login"; }}
          style={{ background: "transparent", border: "1px solid #333", color: "#9ca3af", padding: "5px 10px", borderRadius: "6px", cursor: "pointer", fontSize: "12px" }}
        >
          Logout
        </button>
      </div>

      {/* ── Mobile drawer overlay ── */}
      {drawerOpen && (
        <div className="mobile-only" style={{ position: "fixed", inset: 0, zIndex: 200 }}>
          {/* Backdrop */}
          <div
            onClick={() => setDrawerOpen(false)}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.65)" }}
          />
          {/* Drawer */}
          <div style={{
            position: "absolute", left: 0, top: 0, bottom: 0, width: "280px",
            background: "#111", borderRight: "1px solid #1f1f1f",
            display: "flex", flexDirection: "column",
          }}>
            <div style={{ padding: "20px 24px 12px", borderBottom: "1px solid #1f1f1f" }}>
              <div style={{ fontWeight: 800, fontSize: "17px", color: "#fff" }}>⚽ LP Soccer</div>
              {userEmail && <div style={{ color: "#6b7280", fontSize: "12px", marginTop: "4px" }}>{userEmail}</div>}
            </div>
            <nav style={{ flex: 1, paddingTop: "8px" }}>
              <Link href="/app/teams" style={drawerLinkStyle(pathname.startsWith("/app/teams"))}>Teams</Link>
              <Link href="/app/boards" style={drawerLinkStyle(pathname.startsWith("/app/boards"))}>Boards</Link>
              {role === "admin" && (
                <Link href="/app/admin" style={drawerLinkStyle(pathname.startsWith("/app/admin"))}>Admin</Link>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* ── Page content ── */}
      <main>{children}</main>
    </div>
  );
}
