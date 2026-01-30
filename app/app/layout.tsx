"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getMyRole } from "@/lib/roles";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      const { data } = await supabase.auth.getUser();
      if (!mounted) return;
      setEmail(data.user?.email ?? null);
      if (data.user) {
        const role = await getMyRole();
        if (!mounted) return;
        setIsAdmin(role === "admin");
      } else {
        setIsAdmin(false);
      }
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setEmail(session?.user?.email ?? null);
      // If auth changes, re-evaluate admin role.
      if (session?.user) {
        getMyRole().then((r) => setIsAdmin(r === "admin"));
      } else {
        setIsAdmin(false);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  const navLink = (href: string, label: string) => {
    const active = pathname === href || pathname.startsWith(href + "/");
    return (
      <Link
        href={href}
        className={active ? "font-semibold underline" : "underline"}
      >
        {label}
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b bg-white">
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Link href="/app/teams" className="font-semibold whitespace-nowrap">
              Lone Peak Soccer
            </Link>
            {navLink("/app/teams", "Teams")}
            {navLink("/app/boards", "Boards")}
            {isAdmin ? navLink("/app/admin/users", "Admin") : null}
          </div>

          <div className="flex items-center gap-3">
            {email ? <span className="text-sm text-gray-600 max-w-[220px] truncate">{email}</span> : null}
            <button
              type="button"
              className="border rounded px-3 py-1 text-sm bg-white hover:bg-gray-50"
              onClick={logout}
              title="Log out"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
