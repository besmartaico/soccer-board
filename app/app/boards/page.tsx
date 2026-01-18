"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function BoardsIndexPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setChecking(false);

      // Boards are team-scoped, so this index route should send users to Teams.
      if (data.user) {
        router.replace("/app/teams");
      } else {
        router.replace("/login");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="max-w-xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-2">Boards</h1>
      <p className="text-gray-600 mb-6">
        Boards are organized under a Team. Redirecting you to Teams...
      </p>

      {checking ? (
        <p>Checking session...</p>
      ) : (
        <p>
          If you aren't redirected, go to{" "}
          <Link className="underline" href="/app/teams">
            Teams
          </Link>
          .
        </p>
      )}
    </main>
  );
}
