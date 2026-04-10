# Agentura

[![npm version](https://img.shields.io/npm/v/agentura.svg)](https://www.npmjs.com/package/agentura)
[![CI](https://github.com/SyntheticSynaptic/agentura/actions/workflows/ci.yml/badge.svg)](https://github.com/SyntheticSynaptic/agentura/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Make sure your AI agent still works after every change.**

Agentura tests your agent on every pull request and tells you
what broke before you merge. Like pytest, but for AI agents.

→ **[Try it live: playground.agentura.run](https://playground.agentura.run)**

Run a real baseline vs branch comparison in your browser. No install. No account.

---

## Try it in 60 seconds

```bash
npx agentura@latest init
npx agentura@latest run --local
```

`init` generates an `agentura.yaml` config and a baseline snapshot.
`run --local` scores your agent against expected outputs and shows
you exactly what passed, what failed, and what regressed.

---

## What problem does this solve?

You push a change. Your agent behaves differently. You find out
from a user, not from a test.

Agentura catches this before merge:

- You updated the system prompt — did accuracy drop?
- Your model provider pushed a silent update — did tone shift?
- You added a new tool — are the right ones being called?
- You cut the system prompt to reduce costs — did safety regress?

A GitHub Action runs your tests. Agentura is the tests.

---

## How it works

**1. Define expected behaviors in YAML**

```yaml
version: 1
agent:
  type: http
  endpoint: https://your-agent.example.com/invoke
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

**2. Run locally to set a baseline**

```bash
agentura run --local
```

Agentura calls your agent, scores every case, and saves a baseline
snapshot in `.agentura/baseline.json`.

**3. Every PR is compared to that baseline**

```
Regressions (2 cases flipped from pass to fail):
  ✗ case_3: "What is the refund policy?"
    expected: "30-day money back guarantee"
    actual:   "We do not offer refunds"

Improvements (1 case flipped from fail to pass):
  ✓ case_12: "How do I reset my password?"

→ Merge blocked: accuracy suite below threshold
```

Results post directly to your pull request as a comment and
GitHub Check Run.

---

## Eval strategies

| Strategy | What it tests | Requires |
|---|---|---|
| `golden_dataset` | Exact, fuzzy, or semantic match | Nothing (semantic needs API key) |
| `llm_judge` | Tone, helpfulness, quality | Any LLM API key |
| `tool_use` | Tool invocation and argument validation | Nothing |
| `performance` | Latency and cost guardrails | Nothing |
| Multi-turn | Conversational agent behavior across turns | Nothing |

LLM judge and semantic similarity auto-detect your provider:
set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`,
or `GROQ_API_KEY`, or run Ollama locally with no API key at all.

---

## Multi-turn eval

Most eval tools only test single questions. Agentura tests whether
your agent behaves consistently across a full conversation.

```json
{
  "conversation": [
    {"role": "user", "content": "I am on the Pro plan, what storage do I get?"},
    {"role": "assistant", "expected": "Pro plan includes 100GB storage"},
    {"role": "user", "content": "Can I upgrade individual team members?"},
    {"role": "assistant", "expected": "Yes, you can manage seats in Settings > Team"}
  ],
  "eval_turns": [2, 4]
}
```

This catches failures that single-turn evals miss — agents that
drift from constraints established earlier in the conversation,
or give generic answers when they should reference prior context.

---

## Works with any agent

| Framework | Example |
|---|---|
| OpenAI Agents SDK | [examples/openai-agent](examples/openai-agent) |
| Anthropic Claude | [examples/anthropic-agent](examples/anthropic-agent) |
| LangChain | [examples/langchain-agent](examples/langchain-agent) |
| Any HTTP endpoint | [examples/http-agent](examples/http-agent) |

Your agent just needs to expose an HTTP endpoint. No SDK required.

---

## GitHub Actions

```yaml
- uses: SyntheticSynaptic/agentura@main
  with:
    config: agentura.yaml
  env:
    ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Full docs: [docs/github-action.md](docs/github-action.md)

---

## Comparison

| Feature | Agentura | Braintrust | LangSmith | DeepEval |
|---|---|---|---|---|
| Open source | ✅ MIT | ❌ | ❌ | ✅ |
| CI/CD native | ✅ | Partial | ❌ | Partial |
| Framework agnostic | ✅ | ✅ | LangChain-first | ✅ |
| Self-hostable | ✅ | ❌ | ❌ | ✅ |
| Local mode (no signup) | ✅ | ❌ | ❌ | Partial |
| Local inference (no API key) | ✅ via Ollama | ❌ | ❌ | Partial |
| Regression diff | ✅ | ❌ | ❌ | ❌ |
| Multi-turn eval | ✅ | Partial | Partial | ❌ |
| Tool-call validation | ✅ | ❌ | ❌ | Partial |
| Semantic similarity | ✅ | ✅ | ✅ | ✅ |
| Audit manifests | ✅ | ❌ | ❌ | ❌ |
| Locked dataset mode | ✅ | ❌ | ❌ | ❌ |

---

## For regulated environments

Agentura includes a governance layer for teams building
AI agents in healthcare, finance, or other regulated domains.

- **Audit manifests** — every run writes dataset hashes, CLI version,
  git sha, and per-suite results to `.agentura/manifest.json`
- **Locked mode** — exits 1 if any dataset changed since baseline,
  for environments requiring reproducible eval sets
- **Behavioral drift detection** — compare against a frozen reference
  snapshot to detect gradual drift over time
- **Heterogeneous consensus** — run the same query across multiple
  model families and require agreement before accepting an output
- **Clinical audit report** — generate a single self-contained HTML
  artifact for CMIO review and FDA PCCP documentation

```bash
agentura run --local --locked --drift-check
agentura report --since 2026-03-01 --out audit-march.html
```

See [docs/clinical-report.md](docs/clinical-report.md).

---

## Self-hosting

Agentura is fully open source. Run your own instance:
[docs/self-hosting.md](docs/self-hosting.md)

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).
Good first issues are labeled in the
[issue tracker](https://github.com/SyntheticSynaptic/agentura/issues).

---

## License

MIT
