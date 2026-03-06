# Eval Strategies

## `golden_dataset`

**What it does:** Tests your agent against a set of input/expected pairs. Each response is scored using the configured scorer.

**When to use:** When you have known correct answers.

**Good for:** Factual Q&A, classification, structured output.

**Scorers:**

- `exact_match`: response must exactly match expected
- `contains`: expected text must appear in response
- `semantic_similarity`: overlap-based semantic score (0.0-1.0)

**Example config:**

```yaml
- name: accuracy
  type: golden_dataset
  dataset: ./evals/accuracy.jsonl
  scorer: exact_match
  threshold: 0.8
```

**Example dataset:**

```json
{"input": "what is 2+2", "expected": "4"}
{"input": "what is the capital of France", "expected": "Paris"}
```

## `llm_judge`

**What it does:** Uses an LLM to evaluate response quality against a rubric you define.

**When to use:** When there is no single exact answer.

**Good for:** Tone, helpfulness, creativity, style.

The rubric is a markdown file that tells the judge what to look for. Score is `0.0-1.0`.

**Example config:**

```yaml
- name: quality
  type: llm_judge
  dataset: ./evals/quality.jsonl
  rubric: ./evals/quality-rubric.md
  threshold: 0.7
```

**Example rubric:**

```markdown
# Quality Rubric

Score 1.0 if the answer is correct and concise.
Score 0.5 if the answer is correct but verbose.
Score 0.0 if the answer is incorrect.
```

## `performance`

**What it does:** Runs your dataset and measures latency. No correctness scoring, only response speed.

**When to use:** To track whether your agent is getting slower.

**Good for:** Latency budgets and speed regressions.

Set `latency_threshold_ms` for per-case pass/fail and `threshold` for required pass rate.

**Example config:**

```yaml
- name: speed
  type: performance
  dataset: ./evals/accuracy.jsonl
  latency_threshold_ms: 5000
  threshold: 0.8
```
