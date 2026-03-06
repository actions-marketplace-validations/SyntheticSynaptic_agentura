import Link from "next/link";

export function NavBar() {
  const installUrl = "https://github.com/apps/agenturaci/installations/new";

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <Link href="/" className="text-lg font-bold tracking-tight text-white">
          Agentura
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <a
            href="https://github.com/SyntheticSynaptic/agentura"
            target="_blank"
            rel="noreferrer"
            className="text-slate-300 transition hover:text-white"
          >
            GitHub
          </a>
          <Link href="/dashboard" className="text-slate-300 transition hover:text-white">
            Dashboard
          </Link>
          <a
            href={installUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-md bg-violet-500 px-3 py-2 font-semibold text-white transition hover:bg-violet-400"
          >
            Install →
          </a>
        </nav>
      </div>
    </header>
  );
}
