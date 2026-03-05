# Agentura — Documentation.md
# LIVING DOCUMENT. Agent appends a session entry after every working session.
# Answers: "What happened? What's done? What's next?"
# Never modify Prompt.md or AGENTS.md here — record decisions and status only.

---

## Current Status

**Active milestone:** 13 — Production Deployment
**Progress:** 12 / 19 milestones complete
**Last updated:** Milestone 13 deployment configuration committed (code/config prep complete)
**Next action:** Execute browser-side deployment steps (Vercel, Railway, GitHub App + OAuth URL updates, smoke test)

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
3. Fill in values from: Supabase dashboard, GitHub App settings, Groq console, OpenAI dashboard, Upstash console, Resend dashboard

---

## Milestone Status

| # | Milestone | Status | Notes |
|---|---|---|---|
| 1 | Monorepo scaffold | ✅ Complete | Scaffold created, Next.js app responds at localhost:3000, root validations pass |
| 2 | Database schema | ✅ Complete | Prisma schema + init migration applied, Prisma Studio validated, manual RLS SQL file added for Supabase |
| 3 | Shared types + eval-runner | ✅ Complete | Shared interfaces implemented; eval-runner scorers/strategies/agent-callers and unit tests pass |
| 4 | Next.js base + tRPC + GitHub OAuth | ✅ Complete | OAuth login/callback, protected routes, users.me, and health endpoint validated |
| 5 | GitHub App: install + webhook | ✅ Complete | Webhook signature verification, installation/project sync, and eval-run enqueue validated end-to-end |
| 6 | Eval worker: golden dataset | ✅ Complete | Worker processes eval-run jobs end-to-end for golden_dataset, persists results, and updates GitHub Check Runs |
| 7 | Eval worker: LLM judge | ✅ Complete | Groq-backed llm_judge suite execution works end-to-end with persisted judge reasoning and PR check updates |
| 8 | Eval worker: performance + embeddings | ✅ Complete | Performance suites run end-to-end with latency percentile metadata persisted to SuiteResult and GitHub Check Run updates |
| 9 | PR comment + Check Run | ✅ Complete | Worker posts/upserts PR comment via marker and updates same comment on subsequent pushes |
| 10 | Baseline comparison + regression | ✅ Complete | Baseline comparison runs on PR evals, regressions/improvements are surfaced in PR comments, and check run conclusion honors `block_on_regression` |
| 11 | Web dashboard: project + run views | ✅ Complete | `/dashboard`, project detail, and run detail pages validated end-to-end with expandable suite case rows and compact sparkline trend |
| 12 | CLI: login + sync | ✅ Complete | `agentura login`, `agentura init`, and `agentura run` implemented with local config storage, YAML/dataset loading, colored output, and validated exit-code behavior |
| 13 | Production Deployment | 📋 Planned | Deploy web to Vercel and worker to Railway, set env vars, update GitHub App webhook URL, run full smoke test |
| 14 | API Key Management | 📋 Planned | Add API key model and dashboard settings so CLI login works end-to-end |
| 15 | Landing Page + Waitlist + Pricing | 📋 Planned | Replace `/` with conversion-focused marketing page, pricing, waitlist, and GitHub App CTA |
| 16 | CLI Auth Flow | 📋 Planned | Build `/cli-auth` page and complete browser-to-terminal API key login handoff |
| 17 | SDK Package | 📋 Planned | Publish optional `@agentura/sdk` middleware for richer telemetry reporting |
| 18 | Documentation + Onboarding | 📋 Planned | Build self-serve docs, strategy guides, troubleshooting, and contributor onboarding |
| 19 | Dashboard Polish + Settings | 📋 Planned | Improve settings UX, pagination, mobile responsiveness, and health/status page |

---

## Human Actions Required

Some milestones require human actions outside the codebase. Track them here:

| Milestone | Action | Status |
|---|---|---|
| 5 | Register GitHub App at github.com/settings/apps/new. Required permissions documented in Plan.md M5. Set Webhook URL to ngrok/smee URL in dev, Vercel URL in prod. | ✅ Complete (dev setup) |
| 5 | Set `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` in `.env` | ✅ Complete (local) |
| 5 | Set up smee.io or ngrok for local webhook forwarding | ✅ Complete |
| 13 | Create Vercel project, connect GitHub repo, set all env vars | ⬜ Pending |
| 13 | Create Railway project for worker, set all env vars | ⬜ Pending |
| 13 | Update GitHub App webhook URL to production Vercel domain | ⬜ Pending |
| 13 | Verify Resend sending domain | ⬜ Pending |

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

## Session — 2026-03-05 04:40 UTC

**Milestone:** 10 — Baseline comparison + regression detection
**Status:** COMPLETE

**Files created:**
- None

**Files modified:**
- `apps/worker/src/queue-handlers/eval-run.ts` — removed temporary Milestone 10 debug `console.log` lines after baseline comparison verification passed
- `apps/worker/src/baseline/compare.ts` — removed temporary Milestone 10 debug `console.log` lines from `getBaseline`
- `docs/Documentation.md` — updated current status, milestone table, and appended this session handoff

**Decisions made:**
- Kept only functional logging and removed temporary debugging logs now that baseline/regression behavior is verified end-to-end.

**Validation results:**
- `pnpm run type-check`: PASS
- Manual E2E validation for Milestone 10: PASS
  - Baseline comparison runs on every PR
  - No regression shown when scores match baseline
  - Regression table appears when scores drop
  - Overall status shows failed when regressions are detected

**Issues found:**
- None

**Next session:**
Milestone 11 — implement CLI `init` + `run` flow and validate local eval execution UX end-to-end.

---

## Session — 2026-03-05 06:04 UTC

**Milestone:** 11 — Web Dashboard
**Status:** COMPLETE

**Files created:**
- None

**Files modified:**
- `apps/web/src/app/dashboard/[owner]/[repo]/page.tsx` — finalized project detail layout ordering (run history table before trend chart)
- `apps/web/src/components/dashboard/TrendChart.tsx` — rewrote sparkline rendering with fixed geometry (`CHART_HEIGHT=60`, `DOT_RADIUS=3`, `STROKE_WIDTH=1.5`) and overflow clipping
- `docs/Documentation.md` — updated current status, milestone table, and added this completion entry

**Decisions made:**
- Trend chart uses a fixed `viewBox` width (`800`) with `preserveAspectRatio="none"` and fixed y-positions (`10` pass / `50` fail) to keep dot sizing stable across viewport widths.

**Validation results:**
- `pnpm run type-check`: PASS
- `pnpm run build`: PASS
- Manual E2E validation for Milestone 11: PASS
  - `/dashboard` project list + status badges
  - `/dashboard/[owner]/[repo]` run history + sparkline
  - `/dashboard/[owner]/[repo]/runs/[runId]` full run detail
  - Expandable suite case rows, judgeReason visibility, and performance latency display

**Issues found:**
- Test cleanup command was a no-op in this session because `M10_TEST.md`, `M9_TEST.md`, `M8_TEST.md`, and `M7_TEST.md` were already absent from `main`.

**Next session:**
Milestone 12 — implement CLI login + sync flow with authenticated local-to-cloud run synchronization.

---

## Session — 2026-03-05 06:21 UTC

**Milestone:** 12 — CLI: login + sync (init/run/login command implementation phase)
**Status:** IN PROGRESS

**Files created:**
- `packages/cli/src/commands/init.ts` — interactive `agentura init` wizard with YAML + sample dataset generation
- `packages/cli/src/commands/run.ts` — local eval execution command with config validation, strategy dispatch, colored summary output, and non-zero exit on failure
- `packages/cli/src/commands/login.ts` — browser-assisted login flow storing API key in local config
- `packages/cli/src/lib/config.ts` — local CLI config read/write helpers for `~/.agentura/config.json`
- `packages/cli/src/lib/load-dataset.ts` — local JSONL dataset loader with validation and clear parse/file errors
- `packages/cli/src/lib/load-rubric.ts` — local rubric file loader

**Files modified:**
- `packages/cli/src/index.ts` — wired `login`, `init`, `run` commands with commander
- `packages/cli/package.json` — added approved CLI dependencies (`chalk`, `open`, `js-yaml`, `zod`, workspace eval/types)
- `pnpm-lock.yaml` — lockfile updates for approved CLI dependency additions
- `docs/Documentation.md` — updated current status + milestone table and appended this session

**Decisions made:**
- Used lazy dynamic imports for eval-runner strategy modules in `run.ts` so `init` and `login` do not crash due ESM/CJS boundary issues in unrelated llm-judge runtime code.

**Validation results:**
- `pnpm run type-check`: PASS
- `pnpm run build`: PASS
- `pnpm --filter agentura run build`: PASS
- Local smoke (temp dir): `agentura init` creates `agentura.yaml` and `evals/accuracy.jsonl`: PASS
- Local smoke (temp HOME): `agentura login` saves config JSON with `apiKey` and `baseUrl`: PASS
- Local smoke (no agent on localhost:3001): `agentura run` exits 1 and prints failed summary: PASS

**Issues found:**
- Initial runtime crash when importing `@agentura/eval-runner` package root from CLI (`ERR_REQUIRE_ESM` via llm-judge `p-limit`) was resolved by strategy-level lazy imports.

**Next session:**
Milestone 12 — complete human manual E2E checklist and finalize docs with COMPLETE status if all checks pass.

---

## Session — 2026-03-05 06:45 UTC

**Milestone:** 12 — CLI: login + sync
**Status:** COMPLETE

**Files created:**
- None

**Files modified:**
- `docs/Documentation.md` — marked Milestone 12 complete, updated current status, milestone table, and appended this completion handoff

**Decisions made:**
- Milestone 12 was closed based on human manual E2E validation confirming `init`/`run` behavior and expected exit codes.

**Validation results:**
- `pnpm run type-check`: PASS
- `pnpm run build`: PASS
- Manual E2E validation for Milestone 12: PASS
  - `agentura init` creates `agentura.yaml` with correct defaults
  - `agentura init` creates `evals/accuracy.jsonl`
  - `agentura run` shows colored suite summary table
  - `agentura run` exits 0 on success
  - `agentura run` exits 1 on invalid config

**Issues found:**
- None

**Next session:**
Milestone 13 — continue dashboard milestone closure and remaining MVP stabilization tasks.

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

## Session — 2026-02-26 09:53 UTC

**Milestone:** 2 — Database Schema
**Status:** IN PROGRESS

**Files created:**
- None

**Files modified:**
- `docs/Documentation.md` — appended this follow-up session entry after retrying Prisma validation steps

**Decisions made:**
- Use escalated Prisma commands for Milestone 2 validation when sandbox network restrictions block Prisma engine downloads.

**Validation results:**
- `pnpm prisma generate`: PASS (with escalated command and Prisma cache redirected to `/tmp`)
- `pnpm prisma migrate dev --name init` (attempt 1): FAIL (`Error: Schema engine error:` after connecting to Supabase via direct URL on port 5432)
- `pnpm prisma migrate dev --name init` (attempt 2, debug env): FAIL (`Error: Schema engine error:` same result, no additional diagnostics printed)
- `pnpm prisma migrate status`: NOT RUN (blocked until initial migration succeeds)
- `pnpm prisma studio`: NOT RUN (blocked until migration succeeds)
- `pnpm run type-check`: PASS (from earlier Milestone 2 session; no schema/type changes since)

**Issues found:**
- Prisma `migrate dev` is failing with a generic schema engine error against the configured Supabase direct connection (`DIRECT_URL`) despite `prisma generate` succeeding.

**Next session:**
Milestone 2 — diagnose Supabase `prisma migrate dev` schema engine failure (likely migration/shadow DB permissions or connection-string settings), then run `migrate status`, `studio`, and final type-check

## Session — 2026-03-02 19:19 UTC

**Milestone:** 2 — Database Schema
**Status:** COMPLETE

**Files created:**
- `packages/db/prisma/migrations/20260302191259_init/migration.sql` — initial Prisma SQL migration for the 8-table Milestone 2 schema
- `packages/db/prisma/migrations/migration_lock.toml` — Prisma migration lock metadata

**Files modified:**
- `docs/Documentation.md` — updated current status/milestone table and appended this completion entry

**Decisions made:**
- Use Supabase connection URLs exactly as provided (no placeholder tokens) and keep `DIRECT_URL` + `DATABASE_URL` split for migrations vs runtime.
- Keep `packages/db/prisma/migrations/rls_policies.sql` as a manual Supabase SQL step; Prisma does not auto-apply that file by design.

**Validation results:**
- `pnpm prisma generate`: PASS
- `pnpm prisma migrate dev --name init`: PASS (`Already in sync, no schema change or pending migration was found`)
- `pnpm prisma migrate status`: PASS (`Database schema is up to date!`)
- `pnpm prisma studio`: PASS (started successfully on `http://localhost:5556`)
- `pnpm prisma db pull --print`: PASS (introspection shows all 8 Milestone 2 tables and RLS warning banners)
- `pnpm run type-check`: PASS

**Issues found:**
- None

**Next session:**
Milestone 3 — implement `@agentura/types` config/execution interfaces and `@agentura/eval-runner` scorers/strategy scaffolding with tests

## Session — 2026-03-02 19:57 UTC

**Milestone:** 3 — Shared Types + Eval Runner Package
**Status:** COMPLETE

**Files created:**
- `packages/eval-runner/src/scorers/exact-match.ts` — exact-match scorer implementation
- `packages/eval-runner/src/scorers/contains.ts` — substring scorer implementation
- `packages/eval-runner/src/scorers/semantic-similarity.ts` — cosine similarity + embedding cache-aware scorer helper
- `packages/eval-runner/src/strategies/golden-dataset.ts` — golden dataset execution strategy
- `packages/eval-runner/src/strategies/llm-judge.ts` — LLM-judge strategy scaffold with deterministic score handling
- `packages/eval-runner/src/strategies/performance.ts` — performance strategy scaffold with p95/cost-based scoring
- `packages/eval-runner/src/agent-caller/http.ts` — HTTP agent caller with timeout + safe error return shape
- `packages/eval-runner/src/agent-caller/cli-runner.ts` — CLI agent caller with timeout + stderr/error handling
- `packages/eval-runner/src/agent-caller/sdk.ts` — SDK agent caller wrapper for in-process agent functions
- `packages/eval-runner/src/scorers/exact-match.test.ts` — unit tests for exact-match scorer
- `packages/eval-runner/src/scorers/contains.test.ts` — unit tests for contains scorer
- `packages/eval-runner/src/strategies/golden-dataset.test.ts` — unit test validating 3-case suite result shape and scoring
- `packages/eval-runner/src/agent-caller/http.test.ts` — timeout-path test ensuring HTTP caller returns `errorMessage` instead of throwing

**Files modified:**
- `packages/types/src/index.ts` — replaced scaffold marker with Milestone 3 shared config/eval/agent/comparison interfaces
- `packages/eval-runner/src/index.ts` — exports for scorers, strategies, and agent callers
- `packages/eval-runner/package.json` — added `test` script and ensured eval-runner build/type-check compiles `@agentura/types` first
- `docs/Plan.md` — marked Milestone 2 and 3 complete in progress table and checked Milestone 3 acceptance criteria
- `docs/Documentation.md` — updated current status/milestone table and appended this completion entry

**Decisions made:**
- Use Node’s built-in test runner (`node --test`) for Milestone 3 unit tests to avoid adding dependencies.
- Keep HTTP caller timeout testing pure by injecting a mock `fetch` that aborts, avoiding sandbox socket binding restrictions.

**Validation results:**
- `cd packages/eval-runner && pnpm run test`: PASS
- `cd packages/eval-runner && pnpm run type-check`: PASS
- `pnpm run type-check`: PASS

**Issues found:**
- None

**Next session:**
Milestone 4 — implement Next.js auth foundations: GitHub OAuth login page/callback, tRPC context + protected procedure, auth middleware, and `/api/v1/health`

## Session — 2026-03-02 20:26 UTC

**Milestone:** 4 — Next.js Base + tRPC + GitHub OAuth
**Status:** IN PROGRESS

**Files created:**
- `apps/web/src/app/(auth)/login/page.tsx` — GitHub OAuth login screen with a single sign-in button
- `apps/web/src/app/auth/callback/route.ts` — OAuth callback handler that exchanges code, upserts user, and redirects to dashboard
- `apps/web/src/app/api/trpc/[trpc]/route.ts` — tRPC HTTP adapter route for GET/POST
- `apps/web/src/app/api/v1/health/route.ts` — REST health endpoint returning status and ISO timestamp
- `apps/web/src/app/dashboard/page.tsx` — protected dashboard shell calling `users.me` server-side
- `apps/web/src/middleware.ts` — request middleware for session refresh + `/dashboard` protection
- `apps/web/src/server/trpc.ts` — tRPC init/context with Supabase session auth and API key fallback
- `apps/web/src/server/routers/_app.ts` — root app router with `users` router merged
- `apps/web/src/server/routers/users.ts` — protected `users.me` procedure backed by Prisma `User` lookup
- `apps/web/src/lib/supabase/server.ts` — server Supabase client factory using `cookies()`
- `apps/web/src/lib/supabase/client.ts` — browser Supabase client factory for client components
- `apps/web/src/lib/supabase/middleware.ts` — Supabase session refresh helper used by middleware
- `apps/web/src/components/providers.tsx` — React Query + tRPC provider wiring for App Router

**Files modified:**
- `apps/web/src/app/layout.tsx` — wrapped app tree with shared providers
- `apps/web/src/app/page.tsx` — replaced placeholder with minimal running landing page
- `apps/web/package.json` — added Milestone 4 runtime deps (`@supabase/ssr`, tRPC, React Query, `superjson`, `@agentura/db`)
- `docs/Documentation.md` — updated milestone status and appended this session entry

**Decisions made:**
- Use tRPC v11 transformer wiring on `httpBatchLink` (client side) with `superjson`, while keeping server transformer in `initTRPC`.
- Keep middleware session refresh helper fail-open when Supabase public env vars are missing so `/api/v1/health` remains callable during local setup.

**Validation results:**
- `pnpm run type-check`: PASS
- `curl http://localhost:3000/api/v1/health`: PASS (`{"status":"ok","timestamp":"..."}`)

**Issues found:**
- Manual OAuth browser validation is still pending human confirmation (`/login` button, GitHub redirect/approval, callback, dashboard welcome, incognito redirect behavior, `users.me` payload).

**Next session:**
Milestone 4 — run and confirm the 5 manual OAuth validation checks, then mark Milestone 4 complete and update Plan/Documentation status

## Session — 2026-03-02 23:44 UTC

**Milestone:** 4 — Next.js Base + tRPC + GitHub OAuth
**Status:** IN PROGRESS

**Files created:**
- None

**Files modified:**
- `docs/Documentation.md` — appended this validation-only session entry

**Decisions made:**
- Use `http://localhost:3001` for browser checks in this session because port `3000` was already occupied by another local process.

**Validation results:**
- `curl http://localhost:3000/api/v1/health`: PASS
- `curl http://localhost:3001/api/v1/health`: PASS
- Browser check `/login` shows "Sign in with GitHub": PASS
- Browser check button click redirects to GitHub OAuth login: PASS
- Browser check `/dashboard` without session redirects to `/login`: PASS
- `curl http://localhost:3001/api/trpc/users.me?input={}` without auth: PASS (returns `UNAUTHORIZED` as expected)

**Issues found:**
- End-to-end OAuth approval/callback completion and authenticated `users.me` payload validation still require human confirmation with a real GitHub login session.

**Next session:**
Milestone 4 — confirm post-OAuth dashboard greeting and authenticated `users.me` response, then mark Milestone 4 complete

## Session — 2026-03-04 20:30 UTC

**Milestone:** 5 — GitHub App: Installation + Webhook
**Status:** COMPLETE

**Files created:**
- `apps/web/src/lib/github-app.ts` — GitHub App singleton using `@octokit/app` with installation-octokit helper
- `apps/web/src/lib/queue.ts` — BullMQ `eval-run` queue with ioredis connection and retry/backoff defaults
- `apps/web/src/app/api/webhooks/github/route.ts` — verified webhook handler for installation/pull_request/push events
- `apps/web/src/server/routers/projects.ts` — protected `projects.list` and `projects.getByOwnerRepo` procedures

**Files modified:**
- `apps/web/src/server/routers/_app.ts` — merged `projects` router into root tRPC router
- `apps/web/src/app/dashboard/page.tsx` — dashboard project list and empty-state install CTA
- `apps/web/package.json` — added `@octokit/app`, `@octokit/webhooks`, `bullmq`, and `ioredis`
- `pnpm-lock.yaml` — lockfile updates for approved Milestone 5 dependencies
- `apps/web/src/app/api/webhooks/github/route.ts` — switched installation user lookup to `githubId`, added repository fallback/API fetch, and removed temporary debug `console.log` statements (kept `console.error` in catch)
- `docs/Documentation.md` — updated status tables and appended this completion entry

**Decisions made:**
- Keep installation-to-user linking soft (`userId: null` when user is missing) so app installation works before OAuth login.
- Fetch repositories from `GET /installation/repositories` when webhook payload repository arrays are empty to support all GitHub installation event shapes.

**Validation results:**
- `pnpm run type-check`: PASS
- Manual validation step 1 (invalid signature returns 400): PASS
- Manual validation step 2 (GitHub App installation triggers webhook): PASS
- Manual validation step 3 (Installation row created in Supabase): PASS
- Manual validation step 4 (Project row created in Supabase): PASS
- Manual validation step 5 (test PR enqueues Upstash job with correct `prNumber` and `branch`): PASS
- Manual validation step 6 (smee.io receives push/check_suite/pull_request events): PASS

**Issues found:**
- None

**Next session:**
Milestone 6 — implement worker `eval-run` queue handler and golden_dataset strategy execution with persistent status updates

## Session — 2026-03-04 20:55 UTC

**Milestone:** 6 — Eval worker: golden dataset
**Status:** IN PROGRESS

**Files created:**
- `apps/worker/src/github/fetch-config.ts` — GitHub repo file fetcher for `agentura.yaml` and JSONL datasets with `js-yaml` + zod validation and 404 handling
- `apps/worker/src/github/check-runs.ts` — GitHub Check Run create/update helpers for worker execution lifecycle
- `apps/worker/src/queue-handlers/eval-run.ts` — BullMQ eval-run processor implementing config fetch, golden suite execution, DB writes, and check-run updates
- `apps/worker/.env` — worker-local env template with required Milestone 6 keys

**Files modified:**
- `apps/worker/src/index.ts` — BullMQ worker bootstrap with Redis connection, required env checks, concurrency=3 processing, startup log, and graceful shutdown handlers
- `apps/worker/package.json` — added approved Milestone 6 dependencies (`@agentura/db`, `@agentura/eval-runner`, `@agentura/types`, `bullmq`, `ioredis`, `@octokit/app`, `js-yaml`, `zod`, `p-limit`, `@types/js-yaml`)
- `pnpm-lock.yaml` — lockfile updates for approved worker dependencies
- `docs/Documentation.md` — updated current status and appended this session entry

**Decisions made:**
- Kept Milestone 6 focused on `golden_dataset` only: `llm_judge` and `performance` suites are logged as skipped.
- Enforced timeout behavior at agent-call level so timed-out cases record score `0` and `errorMessage: "Agent timed out"` while the suite continues.
- Used transactional persistence for run completion writes (`EvalRun`, `SuiteResult`, `CaseResult`) to avoid partial completed-state records.

**Validation results:**
- `pnpm run type-check`: PASS
- `pnpm run build`: PASS (Next.js build emits non-blocking DNS warnings for Upstash host resolution in this environment, but exits successfully)

**Issues found:**
- End-to-end worker verification still requires human-run local infrastructure (GitHub App webhook flow + Supabase + Upstash + test PR).

**Next session:**
Milestone 6 — run manual end-to-end eval worker test and verify: completed `EvalRun` row in Supabase + GitHub Check Run appears on test PR

## Session — 2026-03-04 23:32 UTC

**Milestone:** 6 — Eval worker: golden dataset
**Status:** COMPLETE

**Files created:**
- None

**Files modified:**
- `packages/db/prisma/schema.prisma` — changed `EvalRun.githubCheckRunId` from `Int?` to `BigInt?` to support large GitHub Check Run IDs
- `apps/worker/src/queue-handlers/eval-run.ts` — updated check-run ID handling to store DB values as `bigint` and convert to `number` only for GitHub API calls
- `docs/Documentation.md` — updated current status, milestone table, and appended this completion entry
- `EVAL_TEST.md` — removed temporary Milestone 6 test file from repository

**Decisions made:**
- Store GitHub Check Run IDs as `BigInt` in database rows to avoid INT4 overflow while preserving API compatibility via explicit `Number(...)` conversion for outbound GitHub requests.

**Validation results:**
- `pnpm --filter @agentura/db exec prisma generate`: PASS
- `pnpm run type-check`: PASS
- Manual validation: EvalRun with status `completed` appears in Supabase: PASS
- Manual validation: GitHub Check Run shows green on PR: PASS
- Manual validation: worker processed golden dataset suite correctly: PASS

**Issues found:**
- `M6_TEST.md` was already absent at cleanup time; no additional removal action required.

**Next session:**
Milestone 7 — implement LLM judge strategy in worker with `temperature: 0`, structured JSON parsing, and retry/backoff behavior

## Session — 2026-03-05 00:00 UTC

**Milestone:** 7 — Eval worker: LLM judge
**Status:** IN PROGRESS

**Files created:**
- `packages/eval-runner/src/scorers/llm-judge-scorer.ts` — Groq-backed `scoreLlmJudge()` scorer with JSON parsing, code-fence stripping, score clamping, and non-throw fallback behavior
- `packages/eval-runner/src/scorers/llm-judge-scorer.test.ts` — scorer unit tests for success path, parse fallback, and upper/lower score clamping

**Files modified:**
- `packages/eval-runner/src/strategies/llm-judge.ts` — implemented concurrent (`p-limit(5)`) llm_judge suite runner using Groq scorer and per-case latency tracking
- `packages/eval-runner/src/index.ts` — exports updated for new llm_judge scorer/strategy surface
- `apps/worker/src/github/fetch-config.ts` — added `fetchRubricFile()` and stricter `llm_judge` config validation requiring `rubric`
- `apps/worker/src/queue-handlers/eval-run.ts` — added llm_judge suite execution flow (rubric fetch + dataset fetch + `runLlmJudge`) and GROQ-not-configured graceful skip path
- `apps/worker/src/index.ts` — made `GROQ_API_KEY` optional at startup with warning instead of hard-fail
- `.env.example` — Groq env var maintained as LLM judge key (`GROQ_API_KEY`)
- `packages/eval-runner/package.json` — added `groq-sdk` and `p-limit`
- `apps/worker/package.json` — added `groq-sdk`
- `pnpm-lock.yaml` — lockfile updates for approved dependency changes

**Decisions made:**
- Switched LLM judge integration to Groq (`llama-3.1-8b-instant`, `temperature: 0`) and enforced fail-soft behavior: judge failures/parsing issues return `{ score: 0, reason: "Judge response parse error" }` instead of throwing.
- Kept llm_judge cost tracking at `estimatedCostUsd = 0` for milestone scope and free-tier assumption.

**Validation results:**
- `pnpm --filter @agentura/eval-runner run build`: PASS
- `pnpm run type-check`: PASS
- `pnpm --filter @agentura/eval-runner run test`: PASS (10 tests, including new llm_judge scorer tests)

**Issues found:**
- Root `pnpm run type-check` required refreshing eval-runner declaration output once (`pnpm --filter @agentura/eval-runner run build`) because worker consumes eval-runner types from emitted package declarations.

**Next session:**
Milestone 7 — run manual end-to-end llm_judge validation with a real `GROQ_API_KEY`, then mark milestone complete after confirming SuiteResult + CaseResult `judgeReason` persistence in Supabase and check run visibility on PR

## Session — 2026-03-05 01:24 UTC

**Milestone:** 7 — Eval worker: LLM judge
**Status:** COMPLETE

**Files created:**
- None

**Files modified:**
- `docs/Documentation.md` — updated current status/milestone table and appended this completion entry
- `M7_TEST.md` — removed temporary Milestone 7 test file from repository

**Decisions made:**
- Keep Groq as the llm_judge provider for Milestone 7 with `temperature: 0` and `estimatedCostUsd = 0` under current free-tier assumptions.

**Validation results:**
- `pnpm run type-check`: PASS
- `pnpm --filter @agentura/eval-runner run test`: PASS
- Manual validation: worker logged `Running llm_judge suite: quality`: PASS
- Manual validation: `SuiteResult` row in Supabase for `quality` suite with pass/fail result: PASS
- Manual validation: `CaseResult` rows persisted with `judgeReason` from Groq: PASS
- Manual validation: GitHub Check Run green on PR: PASS

**Issues found:**
- None

**Next session:**
Milestone 8 — implement performance strategy and semantic similarity with embedding cache, then validate cache-hit behavior and latency metric persistence

## Session — 2026-03-05 02:46 UTC

**Milestone:** 8 — Eval worker: performance + embeddings
**Status:** COMPLETE

**Files created:**
- `packages/db/prisma/migrations/20260305023322_add_suite_result_metadata/migration.sql` — Prisma migration to add nullable `metadata` column on `SuiteResult`

**Files modified:**
- `packages/db/prisma/schema.prisma` — added `SuiteResult.metadata` as optional `String?`
- `docs/Documentation.md` — updated current status, milestone table, and appended this completion entry

**Decisions made:**
- Persist suite-level latency aggregates (`p50`, `p95`, `p99`, `meanLatencyMs`, `maxLatencyMs`, `minLatencyMs`) in `SuiteResult.metadata` as JSON text for Milestone 8 without additional schema refactors.

**Validation results:**
- `pnpm run type-check`: PASS
- Manual validation: performance suite ran successfully: PASS
- Manual validation: `SuiteResult` row in Supabase for `speed` suite: PASS
- Manual validation: metadata includes latency percentiles (`p50`/`p95`/`p99`): PASS
- Manual validation: GitHub Check Run appears on PR: PASS

**Issues found:**
- None

**Next session:**
Milestone 9 — implement PR comment posting and finalize Check Run output formatting/details

## Session — 2026-03-05 03:18 UTC

**Milestone:** 9 — PR comment + Check Run
**Status:** COMPLETE

**Files created:**
- `apps/worker/src/github/pr-comments.ts` — PR comment builder and marker-based upsert helper using GitHub Issues comment APIs

**Files modified:**
- `apps/worker/src/queue-handlers/eval-run.ts` — wired PR comment posting after check run update, then removed temporary octokit debug logs after validation
- `apps/worker/src/github/pr-comments.ts` — switched to `octokit.request(...)` route calls for list/create/update comment compatibility
- `docs/Documentation.md` — updated milestone status and appended this completion entry

**Decisions made:**
- Use marker-based upsert (`<!-- agentura-eval-comment -->`) for one durable Agentura PR comment per PR, and use `octokit.request(...)` route calls for compatibility across installation octokit shapes.

**Validation results:**
- `pnpm run type-check`: PASS
- Manual validation: PR comment appears with results table: PASS
- Manual validation: all three suites shown (`accuracy`, `quality`, `speed`): PASS
- Manual validation: second commit updated existing comment (no duplicate): PASS
- Manual validation: commit SHA updated correctly on second push: PASS

**Issues found:**
- Installation octokit instance did not expose named `issues.*` helpers in this runtime; resolved by switching to explicit route-based `octokit.request(...)` calls.

**Next session:**
Milestone 10 — implement baseline run lookup, regression detection, and baseline/delta rendering in PR comment + check run summary

## Session — 2026-03-05 08:10 UTC

**Milestone:** Roadmap revision
**Status:** COMPLETE

**Files created:**
- None

**Files modified:**
- `docs/Plan.md` — revised milestone roadmap to 19 milestones; marked Milestones 1–12 as complete; replaced old Milestones 13–17 with new Milestones 13–19 exactly as specified; added target customer persona section
- `docs/Documentation.md` — updated current status, milestone status table, and human-actions milestone references to match revised roadmap

**Decisions made:**
- Milestone numbering and planning source now align to a 19-milestone roadmap with post-MVP priorities (deployment, API key management, marketing, CLI auth, SDK, docs/onboarding, dashboard polish).

**Validation results:**
- Documentation update review: PASS (tables and milestone text aligned to revised roadmap request)

**Issues found:**
- None

**Next session:**
Milestone 13 — execute production deployment checklist (Vercel + Railway + webhook cutover + smoke test)

## Session — 2026-03-05 09:05 UTC

**Milestone:** 13 — Production Deployment
**Status:** IN PROGRESS

**Files created:**
- `Dockerfile` — monorepo-root container build for Railway worker deployment
- `railway.json` — Railway Dockerfile builder/deploy configuration for worker service
- `apps/web/vercel.json` — Vercel project build/install config for Next.js app in monorepo
- `apps/web/.env.example` — production-ready web environment variable template
- `apps/worker/.env.example` — production-ready worker environment variable template

**Files modified:**
- `apps/worker/package.json` — added production `start` script and aligned `build` script for dist output
- `apps/web/src/app/api/webhooks/github/route.ts` — added environment-driven app base URL resolution (`NEXTAUTH_URL`/`NEXT_PUBLIC_APP_URL`) for production-safe webhook responses
- `packages/cli/src/commands/init.ts` — made local default agent endpoint configurable via `AGENTURA_DEFAULT_AGENT_ENDPOINT` env var

**Decisions made:**
- Kept localhost values only as explicit fallbacks after environment variables to preserve local development defaults while removing hardcoded production assumptions.

**Validation results:**
- `pnpm run type-check`: PASS
- `pnpm run build`: PASS (web build completed successfully; DNS warnings appeared for unreachable local Upstash hostname in this environment, but build exited 0)

**Issues found:**
- None blocking

**Next session:**
Milestone 13 — execute browser dashboard deployment steps (Vercel + Railway + GitHub App/OAuth URL updates) and run production smoke test

## Session — 2026-03-05 09:22 UTC

**Milestone:** 13 — Production Deployment
**Status:** IN PROGRESS

**Files created:**
- `render.yaml` — Render worker service manifest using the monorepo Dockerfile

**Files modified:**
- `Dockerfile` — set production runtime env and kept worker entrypoint compatible for Railway/Render
- `railway.json` — normalized Dockerfile path format for monorepo root deployment

**Decisions made:**
- Use a single root Dockerfile for both Railway and Render to keep worker deployment behavior consistent across providers.

**Validation results:**
- Config update review: PASS

**Issues found:**
- None

**Next session:**
Milestone 13 — execute production deployments and smoke-test webhook, worker processing, and PR feedback

## Session — 2026-03-05 09:40 UTC

**Milestone:** 13 — Production Deployment
**Status:** IN PROGRESS

**Files created:**
- None

**Files modified:**
- `apps/web/vercel.json` — updated build command to run Prisma client generation before web build and fixed output directory to `.next`
- `packages/db/package.json` — added `generate` script (`prisma generate`) for deployment/build compatibility
- `docs/Documentation.md` — appended this session handoff

**Decisions made:**
- Vercel build now explicitly generates Prisma client from `@agentura/db` before `@agentura/web` build to avoid workspace resolution failures in cloud builds.

**Validation results:**
- `pnpm run build`: PASS (build succeeds; non-blocking local DNS warnings for unavailable Upstash host in this environment)

**Issues found:**
- None blocking

**Next session:**
Milestone 13 — complete Vercel/Railway dashboard configuration and run production end-to-end smoke test
