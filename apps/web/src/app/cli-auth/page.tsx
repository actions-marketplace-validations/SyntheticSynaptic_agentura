"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

type SessionStatus = "checking" | "unauthenticated" | "authenticated";

const TOKEN_PATTERN = /^[a-zA-Z0-9]{32,64}$/;

interface SessionProfile {
  githubLogin: string | null;
  avatarUrl: string | null;
}

function CliAuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("checking");
  const [sessionProfile, setSessionProfile] = useState<SessionProfile>({
    githubLogin: null,
    avatarUrl: null,
  });
  const [isApproving, setIsApproving] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const token = searchParams.get("token")?.trim() ?? "";
  const tokenIsValid = useMemo(() => TOKEN_PATTERN.test(token), [token]);
  const redirectTarget = token
    ? `/cli-auth?token=${encodeURIComponent(token)}`
    : "/cli-auth";
  const loginLink = `/login?redirect=${encodeURIComponent(redirectTarget)}`;

  useEffect(() => {
    let isMounted = true;

    async function checkSession() {
      if (!tokenIsValid) {
        setSessionStatus("unauthenticated");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (!session) {
        setSessionStatus("unauthenticated");
        return;
      }

      const metadata = session.user.user_metadata;
      const record = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>) : {};
      const githubLogin = typeof record.user_name === "string" ? record.user_name : null;
      const avatarUrl = typeof record.avatar_url === "string" ? record.avatar_url : null;

      setSessionProfile({ githubLogin, avatarUrl });
      setSessionStatus("authenticated");
    }

    void checkSession();

    return () => {
      isMounted = false;
    };
  }, [tokenIsValid]);

  async function handleApprove() {
    if (!tokenIsValid || isApproving) {
      return;
    }

    setIsApproving(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/cli-auth/approve", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token }),
      });

      const payload = (await response.json()) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? "Unable to authorize CLI");
      }

      setIsApproved(true);
    } catch {
      setErrorMessage("Unable to authorize CLI. Please try again.");
    } finally {
      setIsApproving(false);
    }
  }

  if (!tokenIsValid) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
        <section className="w-full max-w-lg rounded-xl border border-red-500/30 bg-red-500/10 p-6">
          <h1 className="text-2xl font-semibold text-red-100">Invalid authorization link</h1>
          <p className="mt-2 text-sm text-red-200">
            This CLI authorization link is missing a valid token. Please run{" "}
            <code className="rounded bg-slate-900 px-1.5 py-0.5">agentura login</code> again.
          </p>
        </section>
      </main>
    );
  }

  if (sessionStatus === "checking") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
        <p className="text-sm text-slate-300">Checking your session...</p>
      </main>
    );
  }

  if (sessionStatus === "unauthenticated") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
        <section className="w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 p-8 text-center">
          <h1 className="text-2xl font-semibold text-white">Sign in to authorize the Agentura CLI</h1>
          <p className="mt-3 text-sm text-slate-300">
            You&apos;ll return here automatically after signing in.
          </p>
          <Link
            href={loginLink}
            className="mt-6 inline-flex rounded-md bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400"
          >
            Sign in with GitHub
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-10">
      <section className="w-full max-w-2xl rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-violet-300">Agentura</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Authorize CLI Access?</h1>
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/70 p-3">
          <div className="h-10 w-10 overflow-hidden rounded-full bg-slate-700">
            {sessionProfile.avatarUrl ? (
              <img src={sessionProfile.avatarUrl} alt="GitHub avatar" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <div>
            <p className="text-sm font-medium text-white">
              {sessionProfile.githubLogin ? `@${sessionProfile.githubLogin}` : "Signed in user"}
            </p>
            <p className="text-xs text-slate-400">GitHub account</p>
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-300">
          This will create an API key and save it to your terminal session. You can revoke it
          anytime from the dashboard.
        </p>

        {isApproved ? (
          <p className="mt-6 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-200">
            ✓ CLI authorized! You can close this tab.
          </p>
        ) : (
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => {
                void handleApprove();
              }}
              disabled={isApproving}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isApproving ? "Approving..." : "Approve"}
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="rounded-md border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        )}

        {errorMessage ? <p className="mt-3 text-sm text-red-300">{errorMessage}</p> : null}
      </section>
    </main>
  );
}

export default function CliAuthPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6">
          <p className="text-sm text-slate-300">Loading authorization...</p>
        </main>
      }
    >
      <CliAuthPageContent />
    </Suspense>
  );
}
