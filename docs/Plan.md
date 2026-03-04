# Agentura — Plan.md
# MILESTONE PLAN. Source of truth for build sequence, acceptance criteria, and decisions.
# Agent updates Progress table, Decision Log, and Surprises section as work proceeds.
# Prompt.md > AGENTS.md > Plan.md on any conflict.

---

## How to Use This File

Work milestones in strict order. Run validation commands after every milestone. Fix failures before moving on. Record decisions in Decision Log.

---

## Intended Architecture

```
agentura/
  apps/
    web/
      src/
        app/                    Next.js App Router pages and API routes
          (auth)/               Login page
          dashboard/            Project list
          projects/[owner]/[repo]/   Project detail, run history, settings
          api/
            trpc/[trpc]/        tRPC handler (dashboard calls)
            v1/                 REST endpoints (CLI calls)
              projects/
              runs/
            webhooks/
              github/           GitHub App webhook handler
        server/
          trpc.ts               tRPC init + auth middleware
          routers/              projects, runs, settings tRPC routers
        lib/
          github-app.ts         Octokit App instance
          anthropic.ts          Anthropic client
          openai.ts             OpenAI client (embeddings)
          redis.ts              Upstash client
          queue.ts              BullMQ queue definitions
        components/             UI components
    worker/
      src/
        index.ts                BullMQ worker startup
        strategies/
          golden-dataset.ts     Golden dataset eval strategy
          llm-judge.ts          LLM judge eval strategy
          performance.ts        Latency/cost eval strategy
        scorers/
          exact-match.ts
          semantic-similarity.ts
          contains.ts
        github/
          check-runs.ts         Create/update GitHub Check Runs
          pr-comment.ts         Post/update PR comments
        queue-handlers/
          eval-run.ts           Main eval run job handler
  packages/
    cli/
      src/
        index.ts                Commander.js entry point
        commands/
          init.ts               agentura init wizard
          run.ts                agentura run
          compare.ts            agentura compare
          login.ts              agentura login
          sync.ts               agentura sync
        lib/
          config.ts             agentura.yaml parser + validator
          runner.ts             Local eval execution (calls eval-runner)
          display.ts            Terminal progress + result tables
          auth.ts               Token storage (~/.agentura/config.json)
    eval-runner/
      src/
        index.ts                Exported eval functions
        strategies/             Shared strategy implementations
        scorers/                Shared scorer implementations
        agent-caller/
          http.ts               Call agent via HTTP endpoint
          cli-runner.ts         Call agent via CLI command
          sdk.ts                Call agent via imported function
    db/                         Prisma schema + client
    types/                      Shared TypeScript interfaces
    sdk/                        @agentura/sdk
    ui/                         shadcn/ui components
```

**Data flow for a GitHub-triggered eval run:**
1. PR opened/updated → GitHub sends `pull_request` webhook to `/api/webhooks/github`
2. Webhook handler verifies signature, extracts repo + branch + PR info
3. Fetches `agentura.yaml` from PR branch via GitHub API
4. Creates GitHub Check Run (status: in_progress)
5. Enqueues `eval-run` job to BullMQ with: `{ installationId, owner, repo, branch, prNumber, checkRunId, config }`
6. Worker dequeues job, executes all eval suites (in parallel across cases, sequential across suites)
7. On completion: updates Check Run (pass/fail), fetches baseline run from main, generates comparison
8. Posts PR comment with results table and regression indicators
9. Saves run results to database
10. Supabase Realtime event triggers dashboard update

---

## Progress

| Milestone | Status | Completed |
|---|---|---|
| 1 — Monorepo scaffold | ✅ Complete | 2026-02-26 |
| 2 — Database schema | ✅ Complete | 2026-03-02 |
| 3 — Shared types + eval-runner package | ✅ Complete | 2026-03-02 |
| 4 — Next.js base + tRPC + GitHub OAuth | ⬜ Not started | — |
| 5 — GitHub App — installation + webhook | ⬜ Not started | — |
| 6 — Eval worker — golden dataset strategy | ⬜ Not started | — |
| 7 — Eval worker — LLM judge strategy | ⬜ Not started | — |
| 8 — Eval worker — performance strategy | ⬜ Not started | — |
| 9 — PR comment + Check Run integration | ⬜ Not started | — |
| 10 — Baseline comparison + regression detection | ⬜ Not started | — |
| 11 — CLI — init + run commands | ⬜ Not started | — |
| 12 — CLI — login + sync commands | ⬜ Not started | — |
| 13 — Web dashboard — project + run views | ⬜ Not started | — |
| 14 — Web dashboard — score trend chart + run detail | ⬜ Not started | — |
| 15 — Email notifications | ⬜ Not started | — |
| 16 — SDK package | ⬜ Not started | — |
| 17 — Production deployment | ⬜ Not started | — |

---

## Milestones

---

### Milestone 1 — Monorepo Scaffold

**Goal:** Repository structure exists, all packages initialized, dev server starts.

**Tasks:**
- Initialize Turborepo with pnpm at repo root
- Create `apps/web` — Next.js 14, TypeScript strict, Tailwind, shadcn/ui
- Create `apps/worker` — Node.js TypeScript service
- Create `packages/cli` — TypeScript, Commander.js, bins configured in package.json
- Create `packages/eval-runner` — TypeScript library
- Create `packages/db` — Prisma
- Create `packages/types` — TypeScript interfaces
- Create `packages/sdk` — TypeScript library
- Create `packages/ui` — shadcn/ui wrappers
- Configure `turbo.json` with build, dev, lint, type-check pipeline
- Create `.env.example` at root with all required variable names
- Add `docs/` directory with all five markdown files

**`.env.example` must include:**
```
# Supabase
DATABASE_URL=
DIRECT_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# GitHub App
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_WEBHOOK_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# Anthropic (LLM judge)
ANTHROPIC_API_KEY=

# OpenAI (embeddings for semantic similarity)
OPENAI_API_KEY=

# Upstash Redis (BullMQ)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
UPSTASH_REDIS_URL=   # ioredis-compatible URL for BullMQ

# Resend (email)
RESEND_API_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
CLI_API_BASE_URL=http://localhost:3000
```

**Validation:**
```bash
pnpm install              # Zero errors
pnpm run build            # All packages build
pnpm run type-check       # Zero TypeScript errors
pnpm run dev              # apps/web starts at localhost:3000
```

**Acceptance criteria:**
- [x] `localhost:3000` returns a Next.js page
- [x] `pnpm run type-check` exits 0
- [x] `.env.example` exists with all variables listed
- [x] `packages/cli` has a `bin` field pointing to the CLI entry point

---

### Milestone 2 — Database Schema

**Goal:** Full Prisma schema, migrations applied to Supabase, client exportable.

**Schema — create these models:**

```prisma
model User {
  id            String    @id @default(uuid())
  githubId      String    @unique
  githubLogin   String
  email         String?
  avatarUrl     String?
  apiKey        String?   @unique  // hashed, for CLI auth
  createdAt     DateTime  @default(now())
  installations Installation[]
  projects      Project[]
}

model Installation {
  id              String    @id @default(uuid())
  githubInstallId Int       @unique   // GitHub App installation ID
  userId          String?
  user            User?     @relation(fields: [userId], references: [id])
  accountLogin    String    // org or user login
  accountType     String    // User | Organization
  createdAt       DateTime  @default(now())
  projects        Project[]
}

model Project {
  id             String    @id @default(uuid())
  installationId String
  installation   Installation @relation(fields: [installationId], references: [id])
  userId         String?
  user           User?     @relation(fields: [userId], references: [id])
  owner          String    // GitHub owner (org or user)
  repo           String    // GitHub repo name
  defaultBranch  String    @default("main")
  createdAt      DateTime  @default(now())
  evalRuns       EvalRun[]
  settings       ProjectSettings?
  @@unique([owner, repo])
}

model ProjectSettings {
  id                  String   @id @default(uuid())
  projectId           String   @unique
  project             Project  @relation(fields: [projectId], references: [id])
  regressionThreshold Float    @default(0.05)
  retentionDays       Int      @default(30)
  emailOnFailure      Boolean  @default(true)
  notifyEmail         String?
  updatedAt           DateTime @updatedAt
}

model EvalRun {
  id              String    @id @default(uuid())
  projectId       String
  project         Project   @relation(fields: [projectId], references: [id])
  branch          String
  commitSha       String
  prNumber        Int?
  status          String    // pending | running | completed | failed
  triggeredBy     String    // github_app | cli | api
  githubCheckRunId Int?
  overallPassed   Boolean?
  totalCases      Int?
  passedCases     Int?
  durationMs      Int?
  estimatedCostUsd Float?   // stored as float, display only (not financial)
  createdAt       DateTime  @default(now())
  completedAt     DateTime?
  suiteResults    SuiteResult[]
}

model SuiteResult {
  id            String    @id @default(uuid())
  evalRunId     String
  evalRun       EvalRun   @relation(fields: [evalRunId], references: [id])
  suiteName     String
  strategy      String    // golden_dataset | llm_judge | performance
  score         Float     // 0.0 to 1.0
  threshold     Float
  passed        Boolean
  baselineScore Float?    // score from baseline run for comparison
  regressed     Boolean?
  totalCases    Int
  passedCases   Int
  durationMs    Int
  createdAt     DateTime  @default(now())
  caseResults   CaseResult[]
}

model CaseResult {
  id             String    @id @default(uuid())
  suiteResultId  String
  suiteResult    SuiteResult @relation(fields: [suiteResultId], references: [id])
  caseIndex      Int
  input          String    // truncated to 10k chars
  output         String?   // truncated to 10k chars
  expected       String?   // truncated to 10k chars
  score          Float
  passed         Boolean
  judgeReason    String?   // LLM judge explanation
  latencyMs      Int?
  inputTokens    Int?
  outputTokens   Int?
  errorMessage   String?
  createdAt      DateTime  @default(now())
}

model EmbeddingCache {
  id        String   @id @default(uuid())
  textHash  String   @unique   // SHA-256 of the text
  model     String
  embedding Float[]            // stored as array
  createdAt DateTime @default(now())
}
```

**Validation:**
```bash
pnpm prisma migrate status    # All migrations applied
pnpm prisma studio            # Opens, shows all tables
pnpm run type-check           # Types generated, no errors
```

**Acceptance criteria:**
- [ ] All 9 tables exist in Supabase
- [ ] `import { prisma } from '@agentura/db'` works in other packages
- [ ] RLS enabled on all tables (write SQL migration for policies)

---

### Milestone 3 — Shared Types + Eval Runner Package

**Goal:** All TypeScript interfaces defined; core eval execution functions implemented and tested.

**`packages/types/src/index.ts`** — define:
```typescript
// Config types (mirrors agentura.yaml)
export interface AgenturaConfig { version: number; agent: AgentConfig; evals: EvalSuiteConfig[]; ci: CIConfig }
export interface AgentConfig { type: 'http' | 'cli' | 'sdk'; endpoint?: string; command?: string; module?: string; timeout_ms?: number }
export interface EvalSuiteConfig { name: string; type: 'golden_dataset' | 'llm_judge' | 'performance'; dataset: string; scorer?: 'exact_match' | 'semantic_similarity' | 'contains'; rubric?: string; judge_model?: string; threshold: number; max_p95_ms?: number; max_cost_per_call_usd?: number }
export interface CIConfig { block_on_regression: boolean; regression_threshold: number; compare_to: string; post_comment: boolean; fail_on_new_suite: boolean }

// Eval execution types
export interface EvalCase { input: string; expected?: string }
export interface EvalCaseResult { caseIndex: number; input: string; output: string | null; expected?: string; score: number; passed: boolean; judgeReason?: string; latencyMs: number; inputTokens?: number; outputTokens?: number; errorMessage?: string }
export interface SuiteRunResult { suiteName: string; strategy: string; score: number; threshold: number; passed: boolean; totalCases: number; passedCases: number; durationMs: number; estimatedCostUsd: number; cases: EvalCaseResult[] }
export interface EvalRunResult { branch: string; commitSha: string; suites: SuiteRunResult[]; overallPassed: boolean; totalDurationMs: number }

// Agent caller types
export type AgentFunction = (input: string) => Promise<AgentCallResult>
export interface AgentCallResult { output: string; latencyMs: number; inputTokens?: number; outputTokens?: number }

// Comparison types
export interface SuiteComparison { suiteName: string; currentScore: number; baselineScore: number | null; delta: number | null; regressed: boolean }
export interface RunComparison { suites: SuiteComparison[]; hasRegressions: boolean }
```

**`packages/eval-runner/src/`** — implement:

`agent-caller/http.ts`:
```typescript
// POST to config.endpoint with { input: string }
// Expect response: { output: string } or { result: string }
// Handle timeout using AbortController
// Measure latency with performance.now()
// Parse token usage from response headers or body if present
```

`agent-caller/cli-runner.ts`:
```typescript
// Spawn process with config.command
// Write input to stdin, read output from stdout
// Handle timeout with process.kill()
// Return { output, latencyMs }
```

`scorers/exact-match.ts`: `score = trimmed lowercase match ? 1 : 0`
`scorers/contains.ts`: `score = output.toLowerCase().includes(expected.toLowerCase()) ? 1 : 0`
`scorers/semantic-similarity.ts`: cosine similarity using cached embeddings

`strategies/golden-dataset.ts`: Load JSONL, run agent on each input, score with configured scorer, return SuiteRunResult
`strategies/llm-judge.ts`: Load JSONL, run agent, pass input+output+rubric to judge LLM, parse score + reason
`strategies/performance.ts`: Run agent, collect latency + tokens, compute p50/p95/p99, score based on thresholds

**Validation:**
```bash
cd packages/eval-runner
pnpm run test    # Unit tests pass (write tests for exact-match, contains, golden-dataset with mock agent)
pnpm run type-check
```

**Acceptance criteria:**
- [x] `scoreExactMatch("hello", "hello")` returns 1
- [x] `scoreExactMatch("hello", "world")` returns 0
- [x] `runGoldenDataset` with 3 mock cases returns correct SuiteRunResult shape
- [x] HTTP agent caller handles timeout gracefully (returns errorMessage, not crash)
- [x] All types importable from `@agentura/types`

---

### Milestone 4 — Next.js Base + tRPC + GitHub OAuth

**Goal:** Web app running, tRPC configured, GitHub OAuth login working.

**Tasks:**
- Install all web dependencies
- Configure Supabase auth with GitHub OAuth provider
- Create tRPC router with `createContext` reading Supabase session
- Add `protectedProcedure` that throws UNAUTHORIZED if no session
- Add REST endpoint auth middleware: checks `Authorization: Bearer <api-key>` header, hashes it, looks up user
- Create login page at `/login` with "Sign in with GitHub" button
- Create auth callback handler at `/auth/callback/route.ts`
- Add middleware protecting `/dashboard` and `/projects` routes
- Create basic dashboard shell page (no data yet, just auth check)
- Add health check REST endpoint: `GET /api/v1/health` → `{ status: 'ok' }`

**Validation:**
```bash
curl http://localhost:3000/api/v1/health   # { "status": "ok" }
# Manual: sign in with GitHub → redirected to /dashboard
# Manual: visit /dashboard without auth → redirected to /login
pnpm run type-check
```

**Acceptance criteria:**
- [ ] GitHub OAuth login creates a User record in database
- [ ] Session cookie set after login
- [ ] `/dashboard` without session → `/login`
- [ ] tRPC `users.me` protected procedure returns current user
- [ ] REST `Authorization: Bearer` with valid hashed API key authenticates

---

### Milestone 5 — GitHub App: Installation + Webhook

**Goal:** GitHub App installable on a repo; webhook events received, verified, and processed.

**Tasks:**
- Register a GitHub App (done by human in GitHub settings — document the required permissions below)
- Create `apps/web/src/lib/github-app.ts` — Octokit App instance
- Create `apps/web/src/app/api/webhooks/github/route.ts`:
  - Verify `x-hub-signature-256` with `@octokit/webhooks` — return 400 if invalid
  - Handle `installation.created` — create Installation + Project records
  - Handle `installation.deleted` — mark installation inactive
  - Handle `pull_request.opened` + `pull_request.synchronize` — enqueue eval run job
  - Handle `push` to default branch — enqueue eval run job (for baseline updating)
- Create BullMQ queue in `apps/web/src/lib/queue.ts`
- Create tRPC procedures: `projects.list`, `projects.getByOwnerRepo`
- Create dashboard page showing list of installed repos

**Required GitHub App permissions (document for human to configure):**
```
Repository permissions:
  - Contents: Read (to fetch agentura.yaml and dataset files)
  - Pull requests: Read & Write (to post comments)
  - Checks: Read & Write (to create Check Runs)
  - Metadata: Read (required)
  
Subscribe to events:
  - Pull request
  - Push
  - Installation
```

**Validation:**
```bash
# Use smee.io or ngrok to forward webhooks to localhost
# Install the app on a test repo
# Open a PR → verify webhook received in logs
# Verify Installation and Project records created in database
pnpm run type-check
```

**Acceptance criteria:**
- [ ] Webhook with invalid signature returns 400
- [ ] `installation.created` event creates Installation + Project rows
- [ ] `pull_request.opened` event enqueues a job to Redis (verify with `bull-board` or Redis CLI)
- [ ] `/dashboard` shows installed repos from database

---

### Milestone 6 — Eval Worker: Golden Dataset Strategy

**Goal:** Worker processes eval-run jobs end-to-end for the golden_dataset strategy.

**Tasks:**
- Create `apps/worker/src/index.ts` — BullMQ worker initialization
- Create `apps/worker/src/queue-handlers/eval-run.ts`:
  - Dequeue job, load `agentura.yaml` from GitHub (using Installation's access token)
  - Load dataset files from GitHub (JSONL files referenced in config)
  - Run only `golden_dataset` suites (skip others in this milestone)
  - Use `@agentura/eval-runner` for execution
  - Save EvalRun + SuiteResult + CaseResult to database
  - Update EvalRun status: pending → running → completed/failed
- Implement GitHub token refresh: use `@octokit/app` to get installation access token
- Handle agent unreachable gracefully: fail individual cases, not the whole run
- Run 10 cases concurrently (use `p-limit` package — request human approval first)

**Validation:**
```bash
# Start worker: cd apps/worker && pnpm run dev
# Manually enqueue a test job with Redis CLI or a test script
# Provide a test agent endpoint (a simple Node.js HTTP server that echoes input)
# Verify: EvalRun row created with status 'completed'
# Verify: CaseResult rows created with correct scores
pnpm run type-check
```

**Acceptance criteria:**
- [ ] Worker starts and logs "Waiting for eval-run jobs"
- [ ] Test job with 5 golden_dataset cases completes and writes correct DB rows
- [ ] Exact match scorer and contains scorer both work correctly
- [ ] Agent timeout is handled gracefully (case fails with errorMessage, run continues)
- [ ] EvalRun.status transitions correctly: pending → running → completed

---

### Milestone 7 — Eval Worker: LLM Judge Strategy

**Goal:** LLM judge strategy works with Anthropic claude-3-5-haiku, structured output, temperature 0.

**Tasks:**
- Create `apps/worker/src/strategies/llm-judge.ts`
- Load rubric markdown file from GitHub
- For each case: run agent, then call Anthropic with:
  ```
  System: You are an evaluation judge. Score the following agent output.
  Rubric: [rubric content]
  
  Input: [input]
  Output: [agent output]
  
  Respond with JSON only: { "score": 0.0-1.0, "reason": "brief explanation" }
  ```
- Use `temperature: 0`, `max_tokens: 200`
- Parse JSON response — if parsing fails, score = 0 with error reason
- Implement exponential backoff for Anthropic API errors (3 retries: 1s, 2s, 4s)
- Track token usage for cost estimation

**Token cost tracking:**
```
Input: $0.80 / 1M tokens (haiku)
Output: $4.00 / 1M tokens (haiku)
Store as microdollars in memory during run, sum to estimatedCostUsd on completion
```

**Validation:**
```bash
# Run a test eval job with llm_judge strategy
# Verify: judge is called with correct prompt structure
# Verify: score is between 0 and 1
# Verify: judgeReason is populated in CaseResult
# Verify: estimated cost is non-zero in EvalRun
pnpm run type-check
```

**Acceptance criteria:**
- [ ] LLM judge returns score in [0, 1] range for all cases
- [ ] temperature: 0 is verified in Anthropic API call (check logs)
- [ ] Malformed JSON response from judge → score = 0, errorMessage populated
- [ ] Anthropic rate limit error → retries with backoff, not immediate failure
- [ ] Token cost tracked and stored in EvalRun.estimatedCostUsd

---

### Milestone 8 — Eval Worker: Performance Strategy + Semantic Similarity

**Goal:** Performance eval and semantic similarity scorer both work.

**Performance strategy:**
- Run each case N times (default: 3 warmup + 10 measured) — for MVP, simplify to 1 run each
- Collect: latency per call, input/output token counts
- Compute: p50, p95 latency from all cases
- Score: 1.0 if p95 < threshold, scales linearly down to 0 at 2x threshold
- Cost score: 1.0 if cost < threshold, 0 if over

**Semantic similarity scorer:**
- Calculate SHA-256 of text, check `EmbeddingCache` table first
- If cache miss: call OpenAI `text-embedding-3-small` API, store in cache
- Compute cosine similarity: `dot(a,b) / (|a| * |b|)`
- Return similarity as score (0 to 1)

**Validation:**
```bash
# Run golden_dataset eval with semantic_similarity scorer
# Verify: embedding cache entries created in DB after first run
# Second run of same cases: verify cache is used (no OpenAI API calls)
# Performance eval: verify latency metrics in SuiteResult

pnpm run type-check
```

**Acceptance criteria:**
- [ ] Semantic similarity between identical strings returns ~1.0
- [ ] Embedding cache: second run with same inputs makes zero OpenAI API calls (check logs)
- [ ] Performance suite produces p50 and p95 latency values in SuiteResult
- [ ] All three eval strategies run in a single EvalRun when all three configured

---

### Milestone 9 — PR Comment + Check Run Integration

**Goal:** Eval run completion posts a PR comment and updates GitHub Check Run.

**PR comment format (Markdown, must render well on mobile):**

```markdown
## Agentura Eval Results

| Suite | Strategy | Score | Threshold | Status |
|---|---|---|---|---|
| accuracy | golden_dataset | 0.87 | 0.85 | ✅ PASS |
| quality | llm_judge | 0.73 | 0.80 | ❌ FAIL |

**Overall: ❌ 1 suite failed**

<details>
<summary>accuracy — 87% pass rate (13/15 cases)</summary>

| # | Score | Status |
|---|---|---|
| 1 | 1.00 | ✅ |
| 2 | 0.00 | ❌ |
...
</details>

*Eval run ID: `abc123` · [View full results](https://app.agentura.dev/projects/owner/repo/runs/abc123)*
```

**Check Run:**
- Title: "Agentura Evals"
- Conclusion: "success" or "failure"
- Summary: "3/3 suites passed" or "1/3 suites failed"
- Annotations: one per failed suite, pointing to the dataset file + line of first failing case

**Tasks:**
- Create `apps/worker/src/github/pr-comment.ts`
  - Find existing Agentura comment on PR (to update it, not create duplicate)
  - Use octokit to create or update comment
- Create `apps/worker/src/github/check-runs.ts`
  - Create Check Run at job start (status: in_progress)
  - Update Check Run at completion (success/failure + annotations)
- Wire both into `eval-run.ts` queue handler

**Validation:**
```bash
# Trigger a real PR eval run end-to-end
# Verify: PR comment appears (or updates) after eval completes
# Verify: Check Run shows correct status on PR
# Verify: Multiple commits on same PR update the comment rather than creating new ones
```

**Acceptance criteria:**
- [ ] PR comment appears within 90 seconds of PR open (on 15-case suite)
- [ ] Check Run updates from "in_progress" to "success" or "failure"
- [ ] Second commit on same PR updates existing comment, not adds new one
- [ ] Check Run annotation links to failing dataset file + line number

---

### Milestone 10 — Baseline Comparison + Regression Detection

**Goal:** Regression detection works; PR comment shows baseline comparison.

**Baseline definition:** Most recent EvalRun with `status = 'completed'` on `branch = project.defaultBranch` (usually `main`).

**Regression detection:**
```typescript
function isRegressed(current: number, baseline: number, threshold: number): boolean {
  return (current - baseline) < -threshold
}
// Example: current=0.71, baseline=0.79, threshold=0.05 → delta=-0.08 → regressed (|0.08| > 0.05)
```

**Updated PR comment format with regression:**
```markdown
| Suite | Score | Baseline | Delta | Status |
|---|---|---|---|---|
| accuracy | 0.71 | 0.79 | -0.08 ⬇️ | ❌ REGRESSED |
| quality | 0.82 | 0.80 | +0.02 ⬆️ | ✅ PASS |
```

**Push-to-main handling:** When a push to the default branch triggers an eval run (not a PR), this run becomes the new baseline. Mark it with `prNumber = null`.

**Validation:**
```bash
# Create a baseline run by pushing to main
# Open a PR with a change that degrades the agent
# Verify: PR comment shows regression indicator
# Verify: Check Run fails when regression exceeds threshold
# Verify: PR comment shows "No baseline available" for new suites
pnpm run type-check
```

**Acceptance criteria:**
- [ ] Baseline correctly identified as most recent completed run on default branch
- [ ] Regression correctly detected when delta exceeds threshold
- [ ] "No baseline" case handled gracefully (no crash, comment notes missing baseline)
- [ ] Check Run passes when regression is within threshold, fails when exceeded
- [ ] `ci.fail_on_new_suite: false` prevents failure when suite has no baseline

---

### Milestone 11 — CLI: init + run Commands

**Goal:** `npx agentura init` and `npx agentura run` work fully offline.

**`agentura init` wizard (interactive, uses Inquirer.js — request human approval):**
1. "What type is your agent endpoint?" (http / cli)
2. If http: "What is your agent endpoint URL?" (default: http://localhost:3000/api/agent)
3. "Create a sample golden_dataset eval suite?" (yes/no)
4. "Create a sample llm_judge eval suite?" (yes/no)
5. Writes `agentura.yaml` with inline comments
6. If yes to golden_dataset: writes `evals/accuracy.jsonl` with 3 sample cases
7. If yes to llm_judge: writes `evals/quality_rubric.md` with sample rubric
8. Prints: "Run `npx agentura run` to execute your first eval"

**`agentura.yaml` generated by init (with inline comments):**
```yaml
version: 1

# Configure how Agentura calls your agent
agent:
  type: http
  endpoint: http://localhost:3000/api/agent  # POST { input: string } → { output: string }
  timeout_ms: 30000  # Max ms to wait for agent response

evals:
  # Golden dataset: compare agent output to expected output
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/accuracy.jsonl   # One case per line: {"input": "...", "expected": "..."}
    scorer: semantic_similarity        # exact_match | semantic_similarity | contains
    threshold: 0.85                    # Fail if score drops below this

ci:
  block_on_regression: true      # Fail PR check if score drops vs baseline
  regression_threshold: 0.05     # Allow up to 5% drop before failing
  compare_to: main               # Branch to compare against for baseline
  post_comment: true
  fail_on_new_suite: false
```

**`agentura run` command:**
- Parse and validate `agentura.yaml` (clear error if missing or malformed)
- For each suite: call `eval-runner` package functions
- Show real-time progress in terminal:
  ```
  Running accuracy suite (golden_dataset)...
    Case 1/5 ✅ [0.95]
    Case 2/5 ✅ [1.00]
    Case 3/5 ❌ [0.20]
    Case 4/5 ✅ [0.88]
    Case 5/5 ✅ [0.90]
  
  ┌──────────┬─────────────────┬───────┬───────────┬────────┐
  │ Suite    │ Strategy        │ Score │ Threshold │ Status │
  ├──────────┼─────────────────┼───────┼───────────┼────────┤
  │ accuracy │ golden_dataset  │ 0.79  │ 0.85      │ FAIL   │
  └──────────┴─────────────────┴───────┴───────────┴────────┘
  
  Overall: FAIL (1/1 suites failed)
  Results saved to .agentura/runs/2026-02-25T14:30:00.json
  ```
- Save results as JSON in `.agentura/runs/[ISO-timestamp].json`
- Exit code 1 if any suite fails (enables CI use)
- `--suite <name>` flag to run only one suite

**Validation:**
```bash
npx agentura init                    # Wizard runs, files created
npx agentura run                     # Shows progress, prints table
npx agentura run --suite accuracy    # Runs only accuracy suite
echo $?                              # 1 if failed, 0 if passed
cat .agentura/runs/*.json | head     # Results file exists and is valid JSON
pnpm run type-check
```

**Acceptance criteria:**
- [ ] `npx agentura init` creates `agentura.yaml` and sample files
- [ ] `npx agentura run` shows case-by-case progress in real-time (not just spinner)
- [ ] Results saved to `.agentura/runs/` directory
- [ ] Exit code 1 when suite fails, 0 when all pass
- [ ] `--suite` flag works
- [ ] Clear error if `agentura.yaml` not found: "Run `npx agentura init` first"

---

### Milestone 12 — CLI: login + sync Commands

**Goal:** CLI can authenticate and sync local results to cloud.

**`agentura login`:**
- Opens browser to `app.agentura.dev/cli-auth`
- Web app shows "Authorize Agentura CLI" screen with GitHub OAuth
- On auth complete, redirects to `agentura://callback?token=<api-key>`
- CLI listens on local HTTP server (random port) for the callback
- Saves token to `~/.agentura/config.json`
- Prints: "Logged in as @githublogin"

**`agentura sync`:**
- Reads all run files from `.agentura/runs/` not yet synced
- POSTs each to `POST /api/v1/runs` with Bearer token
- Marks synced files (add `synced: true` to JSON)
- Prints: "Synced 3 runs to app.agentura.dev"

**REST endpoint `POST /api/v1/runs`:**
- Auth via Bearer API key
- Accept EvalRunResult JSON from CLI
- Create EvalRun + SuiteResult + CaseResult in database
- Associate with Project by detecting repo from git config (sent in request body)
- Return `{ runId, url }`

**Validation:**
```bash
npx agentura login        # Opens browser, token saved
npx agentura run          # Run evals
npx agentura sync         # Syncs to cloud
# Verify: run appears in dashboard
pnpm run type-check
```

**Acceptance criteria:**
- [ ] Login flow opens browser and captures callback token
- [ ] Token stored in `~/.agentura/config.json`
- [ ] `agentura sync` uploads results and prints confirmation
- [ ] REST endpoint creates correct DB records
- [ ] Synced runs appear in web dashboard

---

### Milestone 13 — Web Dashboard: Project List + Run History

**Goal:** Dashboard shows projects and recent eval runs with pass/fail status.

**Pages:**
- `/dashboard` — list of projects (repos with app installed), each showing last run status
- `/projects/[owner]/[repo]` — run history table: date, branch, PR #, overall status, suite scores

**tRPC procedures:**
- `projects.list` — return user's projects with last run status
- `projects.runs.list` — paginated run history for a project
- `runs.getById` — full run with all suite and case results

**Components:**
- Project card: repo name, install status, last run badge (green/red/grey)
- Run row: commit SHA (truncated), branch, PR link, timestamp, per-suite score badges, overall status
- Status badge component: PASS (green), FAIL (red), RUNNING (amber spinner), PENDING (grey)
- Loading skeletons for all pages

**Realtime updates:** Subscribe to Supabase Realtime on `eval_runs` table for current user's projects — update run status live when worker completes.

**Validation:**
```bash
# After running a PR eval end-to-end:
# Visit /dashboard → see the project
# Visit /projects/owner/repo → see run history
# Trigger a new run → watch status update in real-time without page refresh
npx lighthouse http://localhost:3000/dashboard --only-categories=performance
# Target: LCP < 1.5s
pnpm run type-check
```

**Acceptance criteria:**
- [ ] Dashboard shows correct projects for logged-in user
- [ ] Run history shows correct status, scores, and links
- [ ] Run status updates in real-time without page refresh
- [ ] Loading skeletons appear before data loads
- [ ] Pages are server-rendered (initial HTML contains data)

---

### Milestone 14 — Web Dashboard: Score Trend Chart + Run Detail

**Goal:** Score trend chart and per-case breakdown complete the dashboard.

**Score trend chart (`/projects/[owner]/[repo]`):**
- Line chart using `recharts` (request human approval if not already in dependencies)
- One line per eval suite, last 20 runs on X axis
- Threshold shown as dashed horizontal line
- Hovering shows run details (commit, date, score)

**Run detail page (`/projects/[owner]/[repo]/runs/[runId]`):**
- Suite accordion: expand to see case-level results
- Case table: index, input (truncated, expandable), output (truncated, expandable), expected, score, pass/fail, judge reason
- Regression indicator if run has baseline comparison

**Settings page (`/projects/[owner]/[repo]/settings`):**
- Update regression_threshold
- Update email notification preferences
- Show GitHub App installation status
- "Uninstall" link (opens GitHub App settings)

**Validation:**
```bash
# After running 5+ eval runs:
# Visit trend chart → see score history
# Click a run → see per-case breakdown
# Expand a case → see full input/output
pnpm run type-check
```

**Acceptance criteria:**
- [ ] Score trend chart renders with correct data for last 20 runs
- [ ] Threshold line visible on chart
- [ ] Case table shows input, output, score, and judge reason
- [ ] Long inputs/outputs truncated with "show more" expander
- [ ] Settings page saves changes to ProjectSettings table

---

### Milestone 15 — Email Notifications

**Goal:** Email sent on eval failure and weekly digest.

**Emails to implement (via Resend):**

`eval-failure.tsx` — React Email template:
- Subject: "Agentura: [owner/repo] eval failed on PR #[N]"
- Body: suite name, score vs baseline, link to run detail page
- Only send if `ProjectSettings.emailOnFailure = true`

`weekly-digest.tsx` — sent every Monday:
- For each project: count of runs last week, pass rate, any regressions
- Link to dashboard

**BullMQ cron job** in worker: every Monday 8am UTC, send digest to all users with projects.

**Validation:**
```bash
# Trigger a failing eval run
# Verify email arrives in Resend test dashboard within 60s
# Manually trigger weekly digest job
# Verify digest email structure
pnpm run type-check
```

**Acceptance criteria:**
- [ ] Failure email sent within 60 seconds of failed run
- [ ] Email only sent if emailOnFailure setting is true
- [ ] Weekly digest cron triggers and logs "Sent N digest emails"
- [ ] Both email templates render without errors

---

### Milestone 16 — SDK Package

**Goal:** `@agentura/sdk` publishable and usable for programmatic eval execution.

**`AgenturaClient` class:**
```typescript
class AgenturaClient {
  constructor(config: { apiKey: string; baseUrl?: string }) {}
  
  // Run an eval suite against an in-process function
  async runSuite(
    suiteConfig: EvalSuiteConfig,
    agentFn: AgentFunction,
    datasetPath: string
  ): Promise<SuiteRunResult>
  
  // Run all suites from an agentura.yaml config
  async runAll(
    config: AgenturaConfig,
    agentFn: AgentFunction,
    datasetsDir: string
  ): Promise<EvalRunResult>
  
  // Upload results to cloud and get comparison
  async syncAndCompare(result: EvalRunResult, repo: string, branch: string): Promise<RunComparison>
}
```

**README example:**
```typescript
import { AgenturaClient } from '@agentura/sdk'
import { myAgent } from './agent'

const client = new AgenturaClient({ apiKey: process.env.AGENTURA_API_KEY! })

const result = await client.runAll(
  config,          // parsed agentura.yaml
  async (input) => ({ output: await myAgent(input), latencyMs: 0 }),
  './evals'
)

console.log(`Score: ${result.suites[0].score}`)
const comparison = await client.syncAndCompare(result, 'owner/repo', 'main')
if (comparison.hasRegressions) process.exit(1)
```

**Validation:**
```bash
cd packages/sdk && pnpm run build   # Builds to dist/
# Run the README example against a test agent
pnpm run type-check
```

**Acceptance criteria:**
- [ ] SDK builds to ESM + CJS
- [ ] `runAll` runs evals and returns correct EvalRunResult
- [ ] `syncAndCompare` uploads and returns RunComparison
- [ ] README example works when copy-pasted

---

### Milestone 17 — Production Deployment

**Goal:** All services live in production, full demo flow works end-to-end.

**Services:**
- `apps/web` → Vercel (set all env vars, enable Analytics)
- `apps/worker` → Railway (persistent process, set all env vars)
- Supabase production project (enable PITR)
- GitHub App registered in production mode (update webhook URL to Vercel domain)
- Resend with verified sending domain
- Sentry for both apps

**Post-deploy validation (run the full demo flow from Prompt.md, Acts 1–4):**

**Acceptance criteria:**
- [ ] All 22 steps of the demo flow work in production
- [ ] GitHub App webhook returns 200 in production
- [ ] Sentry captures a test error from both apps
- [ ] Worker processes jobs (check Railway logs)
- [ ] CLI `npx agentura run` works against production API

---

## Decision Log

| Date | Decision | Rationale |
|---|---|---|
| Feb 2026 | Anthropic haiku for LLM judge | Best cost/quality ratio for evaluation. ~80% cheaper than sonnet with comparable scoring accuracy on rubric-based eval. |
| Feb 2026 | OpenAI text-embedding-3-small for semantic similarity | Best embeddings per cost. Cached aggressively to minimize API calls. |
| Feb 2026 | tRPC for dashboard, REST for CLI/GitHub webhook | CLI callers and GitHub webhooks are external — REST is simpler. Internal dashboard uses tRPC for type safety. |
| Feb 2026 | Store eval scores as Float 0–1, not percentage | Avoids integer rounding errors when comparing scores. Display layer converts to percentage. |
| Feb 2026 | BullMQ worker on Railway, not Vercel | Evals can run for minutes. Vercel functions time out at 60s max. |

---

## Surprises & Discoveries

- 2026-02-26: Next.js 14 rejects `next.config.ts`; use `next.config.mjs` with `export default` syntax in this repo.
- 2026-02-26: A CLI scaffold `dev` script that exits immediately causes root `turbo run dev --parallel` to fail even if the web app starts; workspace `dev` scripts must stay alive.

---

## Outcomes & Retrospective

- Milestone 1 complete: monorepo scaffold created, root `pnpm install`, `pnpm run build`, and `pnpm run type-check` pass, and root `pnpm run dev` starts the Next.js app at `localhost:3000`.
