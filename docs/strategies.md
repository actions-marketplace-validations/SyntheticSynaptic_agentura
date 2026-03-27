# Eval Strategies

Agentura supports four suite strategies today: `golden_dataset`, `llm_judge`, `tool_use`, and `performance`. Multi-turn conversation datasets work on top of `golden_dataset` and `llm_judge`.

## `golden_dataset`

**What it does:** Runs your agent against input/expected pairs and scores each response with the configured scorer.

**When to use it:** You know what a good answer should look like and want repeatable, deterministic regression checks.

**Common scorers:**

- `exact_match` — literal string equality after trimming and lowercasing. Use when the answer must be exactly right.
- `fuzzy_match` — token overlap score. Use when wording may vary slightly but structure matters. Fast, works offline, no API key needed.
- `semantic_similarity` — embedding-based cosine similarity. Use for natural language where meaning matters more than wording. Requires an embedding provider (Anthropic, OpenAI, Gemini, Groq, or Ollama).
- `contains` — checks whether expected text appears anywhere in the output. Use it when the agent may return a longer answer but must include a required phrase or keyword.

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

## `contains` scorer

Use `contains` when the agent can add extra wording, but one phrase still has to appear in the answer. Prefer it over `exact_match` when you want to verify a required keyword or sentence fragment without forcing the whole response to match exactly.

**Example config:**

```yaml
- name: policy_mentions
  type: golden_dataset
  dataset: ./evals/policy_mentions.jsonl
  scorer: contains
  threshold: 1.0
```

**Example dataset:**

```json
{"input": "Can I get a refund if this does not work for me?", "expected": "30-day money-back guarantee"}
```

This passes if the agent says something like `Yes — every plan includes a 30-day money-back guarantee.` and fails if the required phrase never appears.

## `semantic_similarity` scorer

`semantic_similarity` is embedding-based. Agentura generates embeddings for the agent output and the expected answer, computes cosine similarity locally, and uses that score in the range `0.0` to `1.0`.

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

**Ollama support:** If Ollama is running, Agentura can score semantic similarity fully offline with no API key. It auto-detects a compatible installed embedding model, or you can pin one with `OLLAMA_EMBED_MODEL`.

If no embedding provider is available, Agentura warns clearly and scores the suite at `0` instead of silently switching algorithms. If you explicitly want string-based matching, use `scorer: fuzzy_match`.

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

**What it does:** Tests whether your agent stays coherent across a realistic workflow instead of only answering one isolated question correctly.

**Why you would use it:** Multi-turn eval catches the production failures that single-turn checks miss:

- Instruction drift: the agent follows a rule early in the conversation, then quietly breaks it a few turns later
- Context carryover failures: the user established account tier, troubleshooting details, or prior decisions, but the agent answers later turns as if that context never happened
- Constraint consistency problems: the agent declines something correctly in turn 1, then caves under conversational pressure in turn 4
- Compounding mistakes: the agent makes a small error early, then treats it as established fact in later turns

The agent receives prior dialogue as a `history` array, so each scored turn is evaluated with the same context a real user conversation would have.

**Flowdesk example dataset:**

```json
{
  "conversation": [
    {"role": "user", "content": "How much does Flowdesk cost?"},
    {"role": "assistant", "expected": "Which account tier are you currently on before I walk through pricing?"},
    {"role": "user", "content": "We are on the Free tier today and comparing upgrade options."},
    {"role": "assistant", "expected": "From Free, Pro is $12 per user per month and Enterprise is custom pricing."}
  ],
  "eval_turns": [2, 4]
}
```

In this case, turn 2 checks that the agent follows the pricing rule instead of answering too early. Turn 4 checks that it uses the newly established account-tier context instead of repeating the same generic clarification.

**What `eval_turns` controls:**

- `eval_turns` selects which assistant turns Agentura should score
- Use it when only certain turns represent the behavior you care about, such as the first policy decision and the later follow-up where drift might appear
- If `eval_turns` is omitted, Agentura scores only the final assistant turn

Scoring specific turns is useful because not every assistant message carries equal weight. A clarifying question in turn 2 and a constraint-sensitive answer in turn 4 are often the moments where regressions show up most clearly.

Works with `golden_dataset` and `llm_judge`.

See `examples/anthropic-agent` for a complete working example with four conversation test cases.

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
