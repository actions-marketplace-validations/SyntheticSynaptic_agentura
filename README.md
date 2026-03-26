# Agentura

[![npm version](https://img.shields.io/npm/v/agentura.svg)](https://www.npmjs.com/package/agentura)
[![CI](https://github.com/SyntheticSynaptic/agentura/actions/workflows/ci.yml/badge.svg)](https://github.com/SyntheticSynaptic/agentura/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

CI/CD eval platform for AI agents. Catch regressions before they reach production.

![Agentura demo](https://raw.githubusercontent.com/SyntheticSynaptic/agentura/main/docs/demo.gif)

## Try it in 60 seconds (no signup required)

```bash
npx agentura@latest init
npx agentura@latest run --local
```

`--local` mode runs your eval suites entirely on your machine —
no login, no GitHub App, no cloud calls required.

## What it does

- Catches regressions before production — shows exactly which
  cases flipped, not just aggregate scores
- Five eval strategies: golden_dataset, llm_judge, performance,
  tool_use, and multi-turn conversation evals
- Semantic similarity scoring — stops failing semantically
  correct answers that use different wording
- LLM judge majority vote — runs judge N times, reports
  agreement rate, flags unreliable results
- Locked mode and audit manifests for regulated environments
- Works with any agent: OpenAI, Anthropic, LangChain, or any
  HTTP endpoint
- Self-hostable and open source (MIT)

## Quick Start (with GitHub integration)

1. Install the GitHub App →
   https://github.com/apps/agenturaci/installations/new
2. Add `agentura.yaml` to your repo root
3. Add your eval dataset
4. Open a PR — results appear as a PR comment and Check Run

Full guide: [docs/quickstart.md](docs/quickstart.md)

## Works with any agent

| Framework | Example |
|---|---|
| OpenAI Agents SDK | [examples/openai-agent](examples/openai-agent) |
| LangChain | [examples/langchain-agent](examples/langchain-agent) |
| Any HTTP endpoint | [examples/http-agent](examples/http-agent) |

## GitHub Actions

Add eval to any repo in one step:

```yaml
- uses: SyntheticSynaptic/agentura@main
  with:
    config: agentura.yaml
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Full docs: [docs/github-action.md](docs/github-action.md)

## Configuration

```yaml
version: 1
agent:
  type: http
  endpoint: https://your-agent.example.com/api/agent
  timeout_ms: 10000
evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/accuracy.jsonl
    scorer: semantic_similarity
    threshold: 0.85
  - name: quality
    type: llm_judge
    dataset: ./evals/quality.jsonl
    rubric: ./evals/rubric.md
    runs: 3
  - name: tool_use
    type: tool_use
    dataset: ./evals/tool_use.jsonl
    threshold: 0.8
  - name: performance
    type: performance
    max_p95_ms: 3000
    max_cost_per_call_usd: 0.01
ci:
  block_on_regression: false
  compare_to: main
  post_comment: true
```

## Eval Strategies

| Strategy | Use case | Requires |
|---|---|---|
| `golden_dataset` | Exact, fuzzy, or semantic match | Nothing (semantic needs API key) |
| `llm_judge` | Tone, helpfulness, quality | Any LLM API key |
| `tool_use` | Tool invocation and argument validation | Nothing |
| `performance` | Latency and cost guardrails | Nothing |
| Multi-turn | Conversational agent testing | Nothing |

LLM judge and semantic similarity auto-detect your provider:
set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`,
or `GROQ_API_KEY`.

## Regression Diff

After the first run, Agentura saves a baseline. Every subsequent
run shows exactly what changed:

```
Regressions (2 cases flipped from pass to fail):
  ✗ case_3: "What is the refund policy?"
    expected: "30-day money back guarantee"
    actual:   "We do not offer refunds"

Improvements (1 case flipped from fail to pass):
  ✓ case_12: "How do I reset my password?"
```

Reset baseline after intentional changes:
```bash
agentura run --local --reset-baseline
```

## Audit Mode (for regulated environments)

Every run writes `.agentura/manifest.json` with dataset hashes,
CLI version, git sha, and per-suite results.

Lock datasets to catch unintended changes:
```bash
agentura run --local --locked
```

Exits with code 1 if any dataset changed since baseline.
Designed for environments requiring audit trails.

## Comparison

| Feature | Agentura | Braintrust | LangSmith | DeepEval |
|---|---|---|---|---|
| Open source | ✅ MIT | ❌ | ❌ | ✅ |
| CI/CD native | ✅ | Partial | ❌ | Partial |
| Framework agnostic | ✅ | ✅ | LangChain-first | ✅ |
| Self-hostable | ✅ | ❌ | ❌ | ✅ |
| Local mode (no signup) | ✅ | ❌ | ❌ | Partial |
| Regression diff | ✅ | ❌ | ❌ | ❌ |
| Multi-turn eval | ✅ | Partial | Partial | ❌ |
| Tool-call validation | ✅ | ❌ | ❌ | Partial |
| Semantic similarity | ✅ | ✅ | ✅ | ✅ |
| Audit manifests | ✅ | ❌ | ❌ | ❌ |
| Locked dataset mode | ✅ | ❌ | ❌ | ❌ |

## Self-hosting

Agentura is fully open source. See
[docs/self-hosting.md](docs/self-hosting.md) to run your own
instance.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
