# Changelog

## [0.6.0] - 2026-04-01

### Added
- Runtime contract enforcement in `agentura trace` — contracts from
  `agentura.yaml` are evaluated on every trace call; `contract_results`
  written to trace JSON; `CONTRACT CHECK` section printed after output;
  `--no-contracts` flag to opt out; exits 1 only on `hard_fail`
- PCCP Readiness Signals section in `agentura report` — five signals
  computed from real eval data (eval coverage, baseline stability, contract
  enforcement, drift status, model version consistency), each with
  PASS/WARN/FAIL status and one-line explanation
- `--format md` flag for `agentura report` — generates a
  GitHub-renderable markdown export with drift table instead of inline SVG

---

## [0.5.0] — 2026-04-01

### Added
- Confidence propagation across multi-turn evals (heuristic_v1) — accumulated
  confidence degrades across turns; a hard_fail applies a ×0.50 multiplier and
  can trigger `escalation_required` even if later turns pass individually
- Contract summary section in `agentura report` — every active contract, all
  assertion results, observed values, and failure mode now appear in the audit
  report HTML
- Realistic natural language triage demo — `examples/triage-agent/` inputs
  updated to reflect how real clinical agents are prompted

### Changed
- Full provider support now consistent across all eval surfaces — Anthropic,
  OpenAI, Gemini, Groq, and Ollama work identically across `llm_judge`,
  `semantic_similarity`, `consensus`, and `trace`

---

## [0.4.1] — 2026-03-31

### Fixed
- `.agentura/` runtime artifacts (baselines, manifests, traces) added to
  `.gitignore` — only `.agentura/reference/` is committed
- Removed previously tracked `.agentura/` artifacts from repo history
- `agentura init` now prints confirmation when `.gitignore` entries are added

### Added
- `docs/self-hosting.md` — "Data and privacy" section documenting what stays
  on disk, what to commit, and that nothing is sent externally under `--local`

---

## [0.4.0] — 2026-03-30

### Added
- Behavioral contracts — define what your agent is allowed to do and gate
  every PR on it via a `contracts` block in `agentura.yaml`
- Four assertion types (fully deterministic, no LLM calls):
  - `allowed_values` — output field must be in an approved set
  - `forbidden_tools` — tool name must not appear in tool_calls
  - `required_fields` — output must contain required keys
  - `min_confidence` — numeric field must meet a minimum threshold
- Four failure modes:
  - `hard_fail` — blocks merge, exits 1
  - `soft_fail` — warning annotation, does not block
  - `escalation_required` — flags for human review, does not block
  - `retry` — re-runs up to 3 times before hard failing
- Contract results appended to `.agentura/manifest.json` after every run
- `examples/triage-agent/` — clinical triage agent demo with two contracts
- Consensus command extended to Groq, Ollama, and Gemini providers

---

## [0.3.0] — 2026-03-28

### Added
- `agentura trace` — structured trace capture for production agent calls with
  tool call records, timing, and PII redaction via `--redact`
- `agentura trace diff` — semantic similarity and tool call delta between any
  two trace runs
- Automatic trace capture on eval failures for review
- `agentura consensus` — heterogeneous multi-model consensus runtime; routes
  one input to multiple model families and votes on the safest answer;
  disagreement surfaced as an explicit safety flag
- `agentura reference` — freeze an agent version as an immutable snapshot
- `agentura reference diff` — behavioral drift score vs a frozen reference
- `--drift-check` flag — fails the run if drift exceeds configured thresholds
- Drift history log written to manifest on every run
- `agentura report` — self-contained HTML clinical audit report with eval
  record, consensus log, drift trend, trace sample, and FDA PCCP alignment
  section; no external dependencies, renders offline

---

## [0.2.2] — 2026-03-26

### Added
- Anthropic Claude agent example
- `agentura generate` — adversarial eval case generation using AI
- Friendly error messages with actionable export commands for missing API keys

---

## [0.2.1] — 2026-03-26

### Added
- Ollama local inference for `llm_judge` and `semantic_similarity` with
  auto-detection of installed models via `/api/tags`
- `OLLAMA_MODEL` and `OLLAMA_EMBED_MODEL` environment variable overrides
- Gemini embedding support via `text-embedding-004`

---

## [0.2.0] — 2026-03-26

### Added
- Regression diff — case-level comparison showing which cases flipped between
  runs (`.agentura/baseline.json`)
- `--reset-baseline` flag to accept current run as new baseline
- Semantic similarity scorer with multi-provider embedding support
  (Anthropic → OpenAI → Gemini → Groq → Ollama auto-detection)
- LLM judge majority vote with configurable `runs: N` and agreement rate
  reporting
- Tool-call eval strategy (`tool_use`) for validating agent tool invocation
  and arguments
- Multi-turn conversation eval across `golden_dataset` and `llm_judge`
  strategies
- Dataset versioning with SHA-256 fingerprinting
- `--locked` mode — exits 1 if datasets changed since baseline
- Audit manifests — `.agentura/manifest.json` written after every run with
  dataset hashes, CLI version, and git SHA
- `--verbose` flag with per-case similarity scores and tool call breakdowns
- CI workflow for the repo itself
- Reusable GitHub Action for users
- `CONTRIBUTING.md` and issue templates

---

## [0.1.2] — 2026-03-16

### Fixed
- README updated with npm badge, `--local` quickstart, and corrected
  performance config shape

---

## [0.1.1] — 2026-03-16

### Fixed
- CLI binary now reports correct version from `package.json`

---

## [0.1.0] — 2026-03-16

### Added
- Initial release
- CLI with `--local` mode (no signup required)
- Three eval strategies: `golden_dataset`, `llm_judge`, and `performance`
- LLM judge auto-detects `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
  `GEMINI_API_KEY`, or `GROQ_API_KEY`
- Working examples for OpenAI, LangChain, and any HTTP agent
- Reusable GitHub Action
