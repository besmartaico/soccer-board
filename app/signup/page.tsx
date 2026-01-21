import { Suspense } from "react";
import SignupClient from "./SignupClient";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-6 bg-white">
          <div className="text-sm text-gray-600">Loading signup…</div>
        </main>
      }
    >
      <SignupClient />
    </Suspense>
  );
}
