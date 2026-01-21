"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function HomePage() {
  const router = useRouter();
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getUser().then(({ data }) => {
      if (!mounted) return;

      if (data?.user) {
        router.replace("/app/teams");
      } else {
        setCheckingSession(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        router.replace("/app/teams");
      }
    });

    return () => {
      mounted = false;
      authListener?.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (checkingSession) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-gray-600">Checking session…</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-3xl font-bold">Lone Peak Knights</h1>

      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded-md bg-black px-5 py-2 text-white hover:bg-gray-800"
        >
          Log In
        </Link>

        <Link
          href="/request-access"
          className="rounded-md border border-gray-300 px-5 py-2 hover:bg-gray-50"
        >
          Request Access
        </Link>
      </div>
    </main>
  );
}
