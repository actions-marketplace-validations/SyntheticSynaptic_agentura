export function PricingSection() {
  const installUrl = "https://github.com/apps/agenturaci/installations/new";

  return (
    <section className="px-6 py-20">
      <div className="mx-auto w-full max-w-6xl">
        <h2 className="text-center text-3xl font-semibold tracking-tight text-white">
          Simple, honest pricing
        </h2>
        <p className="mt-3 text-center text-slate-300">Start free. Upgrade when you&apos;re ready.</p>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <article className="rounded-xl border border-slate-700 bg-slate-900/70 p-7">
            <h3 className="text-xl font-semibold text-white">Free</h3>
            <p className="mt-2 text-4xl font-bold text-white">$0</p>
            <p className="mt-2 text-sm text-slate-300">For solo experiments and quick eval loops</p>
            <ul className="mt-5 space-y-2 text-sm text-slate-200">
              <li>✓ 1 repo</li>
              <li>✓ 50 eval runs / month</li>
              <li>✓ Community support</li>
            </ul>
            <a
              href={installUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-6 inline-flex rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-white"
            >
              Install GitHub App →
            </a>
          </article>

          <article className="rounded-xl border border-slate-700 bg-slate-900/80 p-7">
            <h3 className="text-xl font-semibold text-white">Indie</h3>
            <p className="mt-2 text-4xl font-bold text-white">$19/month</p>
            <p className="mt-2 text-sm text-slate-200">For small teams shipping weekly updates</p>
            <ul className="mt-5 space-y-2 text-sm text-slate-100">
              <li>✓ 5 repos</li>
              <li>✓ 500 eval runs / month</li>
              <li>✓ Email support</li>
            </ul>
            <a
              href="#waitlist"
              className="mt-6 inline-flex rounded-md border border-slate-500 px-4 py-2 text-sm font-semibold text-slate-100 transition hover:border-slate-300 hover:text-white"
            >
              Join Waitlist
            </a>
          </article>

          <article className="rounded-xl border border-violet-500 bg-gradient-to-b from-violet-950/60 to-slate-900 p-7 shadow-[0_8px_30px_rgba(139,92,246,0.25)]">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300">
              Coming Soon
            </p>
            <h3 className="mt-3 text-xl font-semibold text-white">Pro</h3>
            <p className="mt-2 text-4xl font-bold text-white">$49/month</p>
            <p className="mt-2 text-sm text-slate-200">For teams shipping AI to production</p>
            <ul className="mt-5 space-y-2 text-sm text-slate-100">
              <li>✓ Unlimited repos</li>
              <li>✓ Unlimited runs</li>
              <li>✓ Priority support</li>
            </ul>
            <a
              href="#waitlist"
              className="mt-6 inline-flex rounded-md bg-violet-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-400"
            >
              Join Waitlist
            </a>
          </article>
        </div>
      </div>
    </section>
  );
}
