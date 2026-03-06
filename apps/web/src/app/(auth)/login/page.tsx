"use client";

import { Suspense, useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "../../../lib/supabase/client";

function LoginPageContent() {
  const searchParams = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleGitHubLogin = () => {
    startTransition(async () => {
      setErrorMessage(null);
      const supabase = createSupabaseBrowserClient();
      const redirectPath = searchParams.get("redirect");
      const callbackUrl = new URL("/auth/callback", window.location.origin);
      if (redirectPath && redirectPath.startsWith("/")) {
        callbackUrl.searchParams.set("next", redirectPath);
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "github",
        options: { redirectTo: callbackUrl.toString() },
      });

      if (error) {
        setErrorMessage(error.message);
      }
    });
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <section className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-center text-2xl font-semibold tracking-tight text-slate-900">
          Sign in to Agentura
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Authenticate with GitHub to access your dashboard.
        </p>

        <button
          className="mt-6 w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70"
          onClick={handleGitHubLogin}
          type="button"
          disabled={isPending}
        >
          {isPending ? "Redirecting..." : "Sign in with GitHub"}
        </button>

        {errorMessage ? (
          <p className="mt-3 text-sm text-rose-600">{errorMessage}</p>
        ) : null}
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
          <p className="text-sm text-slate-600">Loading login...</p>
        </main>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
