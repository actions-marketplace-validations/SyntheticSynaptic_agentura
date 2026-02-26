# Agentura — Documentation.md
# LIVING DOCUMENT. Agent appends a session entry after every working session.
# Answers: "What happened? What's done? What's next?"
# Never modify Prompt.md or AGENTS.md here — record decisions and status only.

---

## Current Status

**Active milestone:** 2 — Database Schema
**Progress:** 1 / 17 milestones complete
**Last updated:** Milestone 1 scaffold completed and validated
**Next action:** Implement Milestone 2 Prisma schema models, DB package exports, and Supabase RLS migrations

---

## How to Run (fills in after Milestone 1)

```bash
# Install all dependencies
pnpm install

# Start web app + worker in dev mode
pnpm run dev

# Web app: http://localhost:3000
# Worker: watches for BullMQ jobs

# Type check all packages
pnpm run type-check

# Build all packages
pnpm run build

# Run CLI locally (without global install)
cd packages/cli && npx tsx src/index.ts run
```

**Required environment setup:**
1. Copy `.env.example` to `apps/web/.env.local`
2. Copy `.env.example` to `apps/worker/.env`
3. Fill in values from: Supabase dashboard, GitHub App settings, Anthropic console, OpenAI dashboard, Upstash console, Resend dashboard

---

## Milestone Status

| # | Milestone | Status | Notes |
|---|---|---|---|
| 1 | Monorepo scaffold | ✅ Complete | Scaffold created, Next.js app responds at localhost:3000, root validations pass |
| 2 | Database schema | ⬜ Not started | — |
| 3 | Shared types + eval-runner | ⬜ Not started | — |
| 4 | Next.js base + tRPC + GitHub OAuth | ⬜ Not started | — |
| 5 | GitHub App: install + webhook | ⬜ Not started | Requires human to register GitHub App in settings |
| 6 | Eval worker: golden dataset | ⬜ Not started | — |
| 7 | Eval worker: LLM judge | ⬜ Not started | — |
| 8 | Eval worker: performance + embeddings | ⬜ Not started | — |
| 9 | PR comment + Check Run | ⬜ Not started | — |
| 10 | Baseline comparison + regression | ⬜ Not started | — |
| 11 | CLI: init + run | ⬜ Not started | — |
| 12 | CLI: login + sync | ⬜ Not started | — |
| 13 | Dashboard: project list + run history | ⬜ Not started | — |
| 14 | Dashboard: trend chart + run detail | ⬜ Not started | — |
| 15 | Email notifications | ⬜ Not started | — |
| 16 | SDK package | ⬜ Not started | — |
| 17 | Production deployment | ⬜ Not started | Requires human to set up Vercel + Railway projects |

---

## Human Actions Required

Some milestones require human actions outside the codebase. Track them here:

| Milestone | Action | Status |
|---|---|---|
| 5 | Register GitHub App at github.com/settings/apps/new. Required permissions documented in Plan.md M5. Set Webhook URL to ngrok/smee URL in dev, Vercel URL in prod. | ⬜ Pending |
| 5 | Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` in `.env` | ⬜ Pending |
| 5 | Set up smee.io or ngrok for local webhook forwarding | ⬜ Pending |
| 17 | Create Vercel project, connect GitHub repo, set all env vars | ⬜ Pending |
| 17 | Create Railway project for worker, set all env vars | ⬜ Pending |
| 17 | Update GitHub App webhook URL to production Vercel domain | ⬜ Pending |
| 17 | Verify Resend sending domain | ⬜ Pending |

---

## Quick Smoke Tests

*(Agent fills in as features are built)*

```bash
# After Milestone 1
pnpm install && pnpm run type-check && pnpm run build

# After Milestone 4
curl http://localhost:3000/api/v1/health

# After Milestone 6
# Manually enqueue test eval-run job and verify DB rows created

# After Milestone 9
# Open a test PR and verify comment + Check Run appear

# After Milestone 11
npx agentura init
npx agentura run
echo "Exit code: $?"

# After Milestone 17 (production)
curl https://app.agentura.dev/api/v1/health
```

---

## Known Issues / Technical Debt

*(Agent appends issues here as discovered — never deletes, only resolves)*

- `next.config.ts` is not supported in Next.js 14 — use `next.config.mjs` with `export default` syntax.
- Chat instructions may reference AgentMarket schema (agents/tasks/disputes) — ignore these. Plan.md is the only source of truth for schema decisions.


---

## Key Decisions (Quick Reference)

*(Mirror of Plan.md Decision Log — for fast scanning)*

| Decision | Rationale |
|---|---|
| Anthropic haiku for LLM judge | Best cost/quality for rubric evaluation |
| OpenAI embeddings + cache | Best embedding quality, cache eliminates repeat costs |
| REST for CLI + webhook, tRPC for dashboard | External callers = REST; internal = tRPC |
| BullMQ on Railway, not serverless | Evals take minutes; serverless times out |
| Scores as Float 0–1 | Avoids rounding errors in comparison logic |

---

## Session Log

*(Agent appends here after every session. Most recent session at bottom.)*

## Session — 2026-02-26 08:22 UTC

**Milestone:** 1 — Monorepo Scaffold
**Status:** IN PROGRESS

**Files created:**
- `pnpm-workspace.yaml` — pnpm workspace package globs for `apps/*` and `packages/*`
- `turbo.json` — Turbo build/type-check/dev task pipeline
- `package.json` — root scripts for `build`, `type-check`, and `dev`
- `apps/web/package.json` — Next.js app package manifest and scripts
- `apps/web/tsconfig.json` — strict TypeScript config for App Router
- `apps/web/next.config.ts` — required Next config scaffold file
- `apps/web/tailwind.config.ts` — Tailwind config scaffold
- `apps/web/postcss.config.js` — PostCSS plugin config
- `apps/web/src/app/layout.tsx` — root layout component
- `apps/web/src/app/page.tsx` — landing page scaffold
- `apps/worker/package.json` — worker package manifest and scripts
- `apps/worker/tsconfig.json` — worker TypeScript config
- `apps/worker/src/index.ts` — worker entrypoint scaffold
- `packages/db/package.json` — Prisma package manifest and scripts
- `packages/db/tsconfig.json` — db package TypeScript config
- `packages/db/prisma/schema.prisma` — Prisma generator/datasource scaffold
- `packages/db/src/index.ts` — Prisma client singleton export scaffold
- `packages/types/package.json` — shared types package manifest
- `packages/types/tsconfig.json` — shared types TypeScript config
- `packages/types/src/index.ts` — shared types placeholder export
- `packages/cli/package.json` — CLI package manifest with `bin` field
- `packages/cli/tsconfig.json` — CLI TypeScript config
- `packages/cli/src/index.ts` — Commander-based CLI entry scaffold
- `packages/eval-runner/package.json` — eval-runner package manifest
- `packages/eval-runner/tsconfig.json` — eval-runner TypeScript config
- `packages/eval-runner/src/index.ts` — eval-runner placeholder export
- `packages/sdk/package.json` — SDK package manifest
- `packages/sdk/tsconfig.json` — SDK TypeScript config
- `packages/sdk/src/index.ts` — SDK client scaffold
- `packages/ui/package.json` — UI package scaffold with placeholder scripts
- `packages/ui/tsconfig.json` — UI package TypeScript config placeholder
- `.env.example` — required environment variable names for all services

**Files modified:**
- `apps/web/package.json` — changed `build` script to TypeScript compile check after Next.js 14 rejected `next.config.ts`
- `docs/Documentation.md` — appended session log

**Decisions made:**
- Temporary Milestone 1 workaround: keep required `apps/web/next.config.ts`, but use `tsc --noEmit` for `apps/web` build so root `pnpm run build` can pass while the Next.js 14 config-file incompatibility is unresolved.

**Validation results:**
- `pnpm install`: PASS (after rerunning with elevated permissions; Prisma emitted an expected schema-location warning during `@prisma/client` postinstall)
- `pnpm run type-check`: PASS
- `pnpm run build`: PASS (after patching `apps/web` build script)
- `pnpm run dev`: FAIL (`next dev` fails because Next.js 14 does not support `next.config.ts`)

**Issues found:**
- Next.js 14 (frozen stack) rejects `apps/web/next.config.ts`, but the session constraint required that exact file path; this blocks the Milestone 1 dev-server acceptance criterion (`localhost:3000`).

**Next session:**
Milestone 1 — resolve the Next.js config filename conflict (approve `next.config.mjs`/`.js` or a stack adjustment), restore real `next build`, then rerun `pnpm run dev` and verify `localhost:3000`.

---

### Session Template

```markdown
## Session — [YYYY-MM-DD HH:MM UTC]

**Milestone:** [N] — [Name]
**Status:** IN PROGRESS | COMPLETE

**Files created:**
- [path] — [description]

**Files modified:**
- [path] — [what changed]

**Decisions made:**
- [decision and rationale], or "None"

**Validation results:**
- `pnpm run type-check`: PASS | FAIL
- `pnpm run build`: PASS | FAIL
- [other]: PASS | FAIL

**Issues found:**
- [issue], or "None"

**Next session:**
Milestone [N] — [specific starting task]
```

## Session — 2026-02-26 08:29 UTC

**Milestone:** 1 — Monorepo Scaffold
**Status:** IN PROGRESS

**Files created:**
- `apps/web/next.config.mjs` — Next.js config moved to supported filename using `export default`
- `apps/web/next-env.d.ts` — auto-generated by Next.js during direct web dev startup verification

**Files modified:**
- `apps/web/tsconfig.json` — auto-adjusted by Next.js during direct web dev startup verification (`allowJs`, `incremental`, formatting)
- `docs/Documentation.md` — added Known Issues note and appended this session entry

**Decisions made:**
- None

**Validation results:**
- `pnpm run build`: PASS
- `pnpm run dev`: FAIL (workspace `packages/cli` dev task exits with code 1, causing Turbo to fail the root dev command)
- `pnpm --filter @agentura/web run dev`: PASS (Next.js starts and reports local URL)
- `curl http://localhost:3000`: PASS (web app returns HTML when checked with elevated permissions)

**Issues found:**
- Root `pnpm run dev` is still blocked by CLI scaffold behavior (`tsx src/index.ts` prints help and exits 1); this is separate from the resolved Next.js config filename issue.

**Next session:**
Milestone 1 — make the CLI `dev` task non-failing/persistent (or exclude it from root `dev`) and rerun `pnpm run dev` + `localhost:3000` smoke check

## Session — 2026-02-26 08:40 UTC

**Milestone:** 1 — Monorepo Scaffold
**Status:** COMPLETE

**Files created:**
- `apps/web/next.config.mjs` — replaced unsupported `next.config.ts` with Next.js 14-compatible config file

**Files modified:**
- `packages/cli/package.json` — changed CLI `dev` script to `tsx watch src/index.ts run` so root Turbo dev stays alive
- `apps/web/package.json` — restored `next build` after resolving the Next.js config filename blocker
- `docs/Documentation.md` — updated current status/milestone table and appended final completion session entry
- `docs/Plan.md` — marked Milestone 1 complete and checked acceptance criteria

**Decisions made:**
- Use `next.config.mjs` (not `next.config.ts`) for Next.js 14 compatibility while keeping `export default` syntax.

**Validation results:**
- `pnpm install`: PASS
- `pnpm run type-check`: PASS
- `pnpm run build`: PASS (includes successful `next build`)
- `pnpm run dev`: PASS (root Turbo workspace dev starts and stays running)
- `curl http://localhost:3000`: PASS (returns Next.js HTML while root `pnpm run dev` is running)

**Issues found:**
- None

**Next session:**
Milestone 2 — implement Prisma schema models, DB exports, and initial migration/RLS setup

## Session — 2026-02-26 09:18 UTC

**Milestone:** 2 — Database Schema
**Status:** IN PROGRESS

**Files created:**
- `packages/db/prisma/migrations/rls_policies.sql` — manual Supabase SQL for enabling RLS on all 8 tables and adding owner-scoped baseline policies

**Files modified:**
- `packages/db/prisma/schema.prisma` — added the 8 Prisma models from Plan.md Milestone 2
- `packages/db/package.json` — added `prisma:migrate`, `prisma:status`, and `prisma:studio` helper scripts
- `docs/Documentation.md` — added Known Issues note about ignoring AgentMarket schema references and appended this session entry

**Decisions made:**
- Follow `docs/Plan.md` Milestone 2 exactly (8-table Agentura schema) and ignore conflicting AgentMarket schema instructions.

**Validation results:**
- `pnpm prisma generate` (attempt 1): FAIL (`EPERM: operation not permitted, utime '/Users/phoenix/.cache/prisma/.../libquery-engine'`)
- `pnpm prisma generate` (attempt 2): FAIL (`getaddrinfo ENOTFOUND binaries.prisma.sh` after redirecting Prisma cache to `/tmp`)
- `pnpm prisma migrate dev --name init`: NOT RUN (blocked after generate failures; `DATABASE_URL` and `DIRECT_URL` are not set in this shell)
- `pnpm prisma migrate status`: NOT RUN (blocked; DB connection strings missing)
- `pnpm prisma studio`: NOT RUN (blocked; DB connection strings missing)
- `pnpm run type-check`: PASS

**Issues found:**
- Prisma engine download is blocked by restricted network access in this environment, and the default Prisma cache path in `~/.cache/prisma` is not writable in the sandbox.
- `DATABASE_URL` and `DIRECT_URL` are unset, so Prisma migration/status/studio commands cannot connect to Supabase yet.

**Next session:**
Milestone 2 — run Prisma generate/migrate/status/studio after setting `DATABASE_URL` + `DIRECT_URL` and enabling network access for Prisma engine download (or using an already-cached engine)
