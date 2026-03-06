# agentura.yaml Reference

This file lives at the root of your repo.

## `version`

| Field | Type | Default | Description | Example |
|---|---|---|---|---|
| `version` | `number` | none (required) | Config schema version. Must be `1`. | `version: 1` |

## `agent`

| Field | Type | Default | Description | Example |
|---|---|---|---|---|
| `agent` | `object` | none (required) | Defines how Agentura calls your agent. | `agent: ...` |
| `agent.type` | `string` | none (required) | Agent type. For onboarding, use `http`. | `type: http` |
| `agent.endpoint` | `string` | none (required for `http`) | HTTP endpoint that accepts `{ "input": "..." }` and returns `{ "output": "..." }`. | `endpoint: https://your-agent.example.com/api/agent` |
| `agent.timeout_ms` | `number` | `10000` | Per-case timeout in milliseconds. | `timeout_ms: 10000` |
| `agent.headers` | `map<string,string>` | none | Optional headers to send with agent requests. | `headers: { Authorization: "Bearer ..." }` |

## `evals`

| Field | Type | Default | Description | Example |
|---|---|---|---|---|
| `evals` | `array` | none (required) | List of eval suites to run on each PR. | `evals: [...]` |
| `evals[].name` | `string` | none (required) | Unique suite name. | `name: accuracy` |
| `evals[].type` | `string` | none (required) | `golden_dataset` \| `llm_judge` \| `performance` | `type: golden_dataset` |
| `evals[].dataset` | `string` | none (required for `golden_dataset` + `llm_judge`) | Path to JSONL test cases, relative to repo root. | `dataset: ./evals/accuracy.jsonl` |
| `evals[].rubric` | `string` | none (required for `llm_judge`) | Path to rubric markdown file. | `rubric: ./evals/quality-rubric.md` |
| `evals[].scorer` | `string` | `exact_match` | Golden dataset scorer: `exact_match` \| `contains` \| `semantic_similarity`. | `scorer: exact_match` |
| `evals[].threshold` | `number` | `0.8` | Pass threshold in range `0.0` to `1.0`. | `threshold: 0.8` |
| `evals[].judge_model` | `string` | `llama-3.1-8b-instant` | Optional model for `llm_judge`. | `judge_model: llama-3.1-8b-instant` |
| `evals[].latency_threshold_ms` | `number` | none (required for `performance`) | Max per-case latency in milliseconds for pass/fail scoring. | `latency_threshold_ms: 5000` |

## `ci`

| Field | Type | Default | Description | Example |
|---|---|---|---|---|
| `ci` | `object` | defaults below | Pull request behavior controls. | `ci: ...` |
| `ci.block_on_regression` | `boolean` | `false` | If true, fail PR check when regression is detected vs baseline. | `block_on_regression: true` |
| `ci.regression_threshold` | `number` | `0.05` | Allowed score drop before counting as regression. | `regression_threshold: 0.05` |
| `ci.compare_to` | `string` | `main` | Branch used as baseline source. | `compare_to: main` |
| `ci.post_comment` | `boolean` | `true` | Post or update Agentura PR comment after each run. | `post_comment: true` |
| `ci.fail_on_new_suite` | `boolean` | `false` | If true, fail when a new suite has no baseline run yet. | `fail_on_new_suite: false` |

## Complete example

```yaml
version: 1

agent:
  type: http
  endpoint: https://your-agent.example.com/api/agent
  timeout_ms: 10000
  headers:
    Authorization: Bearer your-token

evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/accuracy.jsonl
    scorer: exact_match
    threshold: 0.8

  - name: quality
    type: llm_judge
    dataset: ./evals/quality.jsonl
    rubric: ./evals/quality-rubric.md
    judge_model: llama-3.1-8b-instant
    threshold: 0.7

  - name: speed
    type: performance
    dataset: ./evals/accuracy.jsonl
    latency_threshold_ms: 5000
    threshold: 0.8

ci:
  block_on_regression: false
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
```
