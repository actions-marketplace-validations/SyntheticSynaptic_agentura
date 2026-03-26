# Eval Strategies

Agentura supports four suite strategies today: `golden_dataset`, `llm_judge`, `tool_use`, and `performance`. Multi-turn conversation datasets work on top of `golden_dataset` and `llm_judge`.

## `golden_dataset`

**What it does:** Runs your agent against input/expected pairs and scores each response with the configured scorer.

**When to use it:** You know what a good answer should look like and want repeatable, deterministic regression checks.

**Common scorers:**

- `exact_match` for strict strings and structured outputs
- `contains` when the expected text only needs to appear in the answer
- `semantic_similarity` when wording can vary but meaning should stay the same

**Example config:**

```yaml
- name: accuracy
  type: golden_dataset
  dataset: ./evals/accuracy.jsonl
  scorer: semantic_similarity
  threshold: 0.85
```

**Example dataset:**

```json
{"input": "what is 2+2", "expected": "4"}
{"input": "what is the capital of France", "expected": "Paris"}
```

## `semantic_similarity` scorer

`semantic_similarity` is embedding-based. Agentura generates embeddings for the agent output and the expected answer, computes cosine similarity locally, and uses that score in the range `0.0` to `1.0`.

If no embedding provider is available, Agentura falls back to token overlap instead of crashing the run.

**How to use it:**

```yaml
- name: accuracy
  type: golden_dataset
  dataset: ./evals/accuracy.jsonl
  scorer: semantic_similarity
  threshold: 0.85
```

**Provider auto-detection order:**

1. `ANTHROPIC_API_KEY`
2. `OPENAI_API_KEY`
3. `GEMINI_API_KEY`
4. `GROQ_API_KEY`
5. Ollama, if `http://localhost:11434` is reachable
6. Fallback to token overlap

**Ollama support:** If Ollama is running, Agentura can score semantic similarity fully offline with no API key. It auto-detects a compatible installed embedding model, or you can pin one with `OLLAMA_EMBED_MODEL`.

**Typical threshold:** `0.85`

## `llm_judge`

**What it does:** Uses a judge model to score your agent output against a rubric you define.

**When to use it:** There is no single exact answer and you care about quality, tone, helpfulness, completeness, or reasoning.

**Example config:**

```yaml
- name: quality
  type: llm_judge
  dataset: ./evals/quality.jsonl
  rubric: ./evals/quality-rubric.md
  runs: 3
  threshold: 0.8
```

**Example rubric:**

```markdown
# Quality Rubric

Score 1.0 if the answer is correct and concise.
Score 0.5 if the answer is correct but verbose.
Score 0.0 if the answer is incorrect.
```

## `llm_judge` runs

Set `runs: N` when you want to reduce judge noise.

- `runs` defaults to `1`
- When `runs > 1`, Agentura averages the judge scores
- Pass/fail is decided by majority vote, not by a single sampled run
- `agreement_rate` is reported at the suite level and on each case
- Agentura prints a low-agreement warning when `agreement_rate < 0.70`

## `tool_use`

**What it does:** Validates that your agent called the right tool, supplied the right arguments, and produced the expected output.

**When to use it:** Your agent uses tools or function calls and correctness depends on invoking them properly.

**Scoring weights:**

- `tool_called`: `0.5`
- `args_match`: `0.3`
- `output_match`: `0.2`

If `expected_output` is omitted, Agentura redistributes the score across tool invocation and argument matching.

**Agent requirement:** The agent response must include a `tool_calls` array.

**Example config:**

```yaml
- name: tool_calls
  type: tool_use
  dataset: ./evals/tool_use.jsonl
  threshold: 0.8
```

**Example dataset:**

```json
{"input":"What is 17 times 3?","expected_tool":"calculator","expected_args":{"expression":"17 * 3"},"expected_output":"51"}
```

## Multi-turn eval

**What it does:** Tests conversational agents across full dialogue threads instead of single isolated prompts.

**How it works:**

- The agent receives prior dialogue as a `history` array
- `eval_turns` chooses which assistant turns to score
- If `eval_turns` is omitted, Agentura scores only the final assistant turn
- Works with `golden_dataset` and `llm_judge`

**Example dataset:**

```json
{
  "conversation": [
    {"role": "user", "content": "I want to cancel my subscription"},
    {"role": "assistant", "expected": "I can help you cancel"},
    {"role": "user", "content": "Actually, can I pause it instead?"},
    {"role": "assistant", "expected": "Pausing is available for"}
  ],
  "eval_turns": [2, 4]
}
```

## `performance`

**What it does:** Measures runtime behavior instead of answer quality.

**When to use it:** You want guardrails on latency, cost, or both.

Use `max_p95_ms` to cap p95 latency and `max_cost_per_call_usd` to cap average cost per call.

**Example config:**

```yaml
- name: performance
  type: performance
  dataset: ./evals/performance.jsonl
  max_p95_ms: 3000
  max_cost_per_call_usd: 0.01
  threshold: 1.0
```

`latency_threshold_ms` is deprecated. Use `max_p95_ms` instead.
