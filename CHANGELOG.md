# Changelog

## [0.2.1] — 2026-03-26

### Added
- Ollama local inference support for `llm_judge` and `semantic_similarity` (auto-detects installed models)
- `OLLAMA_MODEL` and `OLLAMA_EMBED_MODEL` env var overrides
- Gemini embedding support via `text-embedding-004`

### Fixed
- Ollama model selection now auto-detects from `/api/tags` instead of hardcoding defaults

## [0.2.0] — 2026-03-26

### Added
- Regression diff: case-level diffs showing which cases flipped between runs (`.agentura/baseline.json`)
- `--reset-baseline` flag to accept current run as new baseline
- Semantic similarity scorer with multi-provider embedding support (Anthropic→OpenAI→Gemini→Groq→Ollama)
- LLM judge majority vote with agreement rate reporting (`runs: N` config option)
- Tool-call eval strategy (`tool_use`) for validating agent tool invocation and arguments
- Multi-turn conversation eval support across `golden_dataset` and `llm_judge` strategies
- Dataset versioning with SHA-256 fingerprinting
- `--locked` mode: exits `1` if datasets changed since baseline
- Audit manifests: `.agentura/manifest.json` written after every run with dataset hashes, CLI version, and git SHA
- `--verbose` flag with per-case similarity scores and tool call breakdowns
- CI workflow for the repo itself
- Reusable GitHub Action for users
- `CONTRIBUTING.md` and issue templates

## [0.1.2] — 2026-03-26

### Fixed
- Updated README with npm badge, `--local` quickstart, and corrected performance config shape

## [0.1.1] — 2026-03-26

### Fixed
- CLI binary now reports correct version from `package.json`

## [0.1.0] — 2026-03-26

### Added
- Initial release
- CLI with `--local` mode (no signup required)
- Three eval strategies: `golden_dataset`, `llm_judge`, and `performance`
- LLM judge auto-detects `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `GROQ_API_KEY`
- Working examples for OpenAI, LangChain, and any HTTP agent
- Reusable GitHub Action
