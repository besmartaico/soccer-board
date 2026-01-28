"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

function isAdmin(email: string | null | undefined) {
  const list = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  if (!email) return false;
  return list.includes(email.trim().toLowerCase());
}

/**
 * Admin landing page
 * - Server enforcement for admin operations is handled by the /api/admin/* routes.
 * - This page provides a clean entry point and blocks non-admin users for UX.
 */
export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<{ email: string } | null>(null);

  const isMeAdmin = useMemo(() => isAdmin(me?.email), [me?.email]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        router.push("/login");
        return;
      }
      setMe({ email: data.user.email || "" });
    })();
  }, [router]);

  if (!me) {
    return (
      <main className="min-h-screen p-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <div className="text-sm text-gray-600">Loading…</div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen p-6 bg-white">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin</h1>
          <div className="flex items-center gap-3 text-sm sb-no-print">
            <Link className="underline" href="/app/teams">
              Teams
            </Link>
            <Link className="underline" href="/app/admin">
              Admin
            </Link>
          </div>
        </div>

        <div className="mt-2 text-sm text-gray-600">
          Signed in as: <span className="font-medium">{me.email}</span>
        </div>

        {!isMeAdmin ? (
          <div className="mt-6 border rounded-xl p-4">
            <div className="font-semibold text-red-700">Not authorized</div>
            <div className="mt-2 text-sm text-gray-700">
              Your account is not listed in <code>NEXT_PUBLIC_ADMIN_EMAILS</code> /{" "}
              <code>ADMIN_EMAILS</code>, so admin tools are blocked.
            </div>
            <div className="mt-4">
              <Link className="underline text-sm" href="/app/teams">
                Back to Teams
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-6 border rounded-xl p-4">
              <div className="font-semibold">Application access</div>
              <div className="mt-2 text-sm text-gray-700">
                Manage which email addresses are allowed to sign up and access the app.
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <Link className="underline text-sm" href="/app/admin/invites">
                  Manage allowed emails (Invites)
                </Link>
                <Link className="underline text-sm" href="/app/admin/requests">
                  Review access requests
                </Link>
              </div>
            </div>

            <div className="mt-6 border rounded-xl p-4">
              <div className="font-semibold">Admin checklist</div>
              <ul className="mt-2 text-sm text-gray-700 list-disc pl-5 space-y-1">
                <li>
                  Add coaches/parents to the allowlist in <b>Invites</b>.
                </li>
                <li>
                  Check <b>Requests</b> for new access requests.
                </li>
                <li>
                  Keep <code>ADMIN_EMAILS</code> and <code>NEXT_PUBLIC_ADMIN_EMAILS</code> updated in
                  your environment variables.
                </li>
              </ul>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
