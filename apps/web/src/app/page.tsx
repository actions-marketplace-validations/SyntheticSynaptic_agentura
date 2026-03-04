export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        Agentura
      </p>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
        App is running
      </h1>
      <p className="text-slate-600">
        Milestone 4 foundation is live. Continue at{" "}
        <a className="font-medium text-slate-900 underline" href="/login">
          /login
        </a>
        .
      </p>
    </main>
  );
}
