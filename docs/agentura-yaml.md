# agentura.yaml Reference

This file lives at the root of your repo and defines how Agentura calls your agent and scores each eval suite.

## `version`

| Field | Type | Default | Description | Example |
|---|---|---|---|---|
| `version` | `number` | none (required) | Config schema version. Must be `1`. | `version: 1` |

## `agent`

| Field | Type | Default | Description | Example |
|---|---|---|---|---|
| `agent.type` | `http \| cli \| sdk` | none (required) | How Agentura calls your agent. | `type: http` |
| `agent.endpoint` | `string` | none | Required for `http` agents. Accepts `{ "input": "..." }` and returns `{ "output": "..." }`. | `endpoint: http://localhost:3000/api/agent` |
| `agent.command` | `string` | none | Required for `cli` agents. Agentura writes the input to stdin and reads stdout. | `command: node agent.js` |
| `agent.module` | `string` | none | Required for `sdk` agents. Path to a local module exporting your agent function. | `module: ./agent.ts` |
| `agent.timeout_ms` | `number` | `10000` | Per-case timeout in milliseconds. | `timeout_ms: 30000` |
| `agent.headers` | `map<string,string>` | none | Optional headers sent with each HTTP request. | `headers: { Authorization: "Bearer ..." }` |

## `evals`

### Common fields

| Field | Type | Default | Description | Example |
|---|---|---|---|---|
| `evals[].name` | `string` | none (required) | Unique suite name. | `name: accuracy` |
| `evals[].type` | `golden_dataset \| llm_judge \| performance \| tool_use` | none (required) | Eval strategy for this suite. | `type: golden_dataset` |
| `evals[].dataset` | `string` | none (required) | Path to a JSONL dataset relative to repo root. | `dataset: ./evals/accuracy.jsonl` |
| `evals[].threshold` | `number` | varies by strategy | Pass threshold in the range `0.0` to `1.0`. | `threshold: 0.85` |

### `golden_dataset`

| Field | Type | Default | Description | Example |
|---|---|---|---|---|
| `evals[].scorer` | `exact_match \| contains \| semantic_similarity` | `exact_match` | Golden dataset scorer. Use `semantic_similarity` when wording can vary. Legacy docs may still mention `fuzzy` or `fuzzy_match`; new configs should use the three values listed here. | `scorer: semantic_similarity` |

### `llm_judge`

| Field | Type | Default | Description | Example |
|---|---|---|---|---|
| `evals[].rubric` | `string` | none (required) | Path to a markdown rubric file. | `rubric: ./evals/quality-rubric.md` |
| `evals[].judge_model` | `string` | provider default | Optional judge model override. | `judge_model: claude-3-5-haiku-20241022` |
| `evals[].runs` | `number` | `1` | Number of judge runs. When `runs > 1`, Agentura averages scores, uses majority vote for pass/fail, and reports agreement rate. | `runs: 3` |

### `performance`

| Field | Type | Default | Description | Example |
|---|---|---|---|---|
| `evals[].max_p95_ms` | `number` | none | Maximum allowed p95 latency for the suite. Replaces deprecated `latency_threshold_ms`. | `max_p95_ms: 3000` |
| `evals[].max_cost_per_call_usd` | `number` | none | Maximum allowed average cost per call in USD. | `max_cost_per_call_usd: 0.01` |

At least one of `max_p95_ms` or `max_cost_per_call_usd` must be set for a `performance` suite.

### `tool_use`

`tool_use` suites validate whether your agent called the right tool, passed the right arguments, and produced the expected output.

Dataset fields for `tool_use` cases:

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `expected_tool` | `string` | Yes | Name of the tool the agent should call. | `"expected_tool": "calculator"` |
| `expected_args` | `object` | Recommended | Expected JSON arguments for the tool call. The current runner uses this for argument validation. | `"expected_args": { "expression": "17 * 3" }` |
| `expected_output` | `string` | Optional | Expected output text after the tool call. | `"expected_output": "51"` |

## Multi-turn conversation format

Use conversation datasets when you want to evaluate a full dialogue instead of a single prompt/response pair.

```json
{
  "conversation": [
    {"role": "user", "content": "..."},
    {"role": "assistant", "expected": "..."},
    {"role": "user", "content": "..."},
    {"role": "assistant", "expected": "..."}
  ],
  "eval_turns": [2, 4]
}
```

Notes:

- Conversation turns must alternate `user` / `assistant`, starting with `user`.
- `eval_turns` refers to assistant turn numbers in the full conversation array.
- If `eval_turns` is omitted, Agentura scores only the final assistant turn.
- Multi-turn datasets work with `golden_dataset` and `llm_judge`.

## CLI flags

These flags are available on `agentura run`:

| Flag | What it does |
|---|---|
| `agentura run --local` | Runs evals entirely on your machine with no login, GitHub App, or cloud sync required. |
| `agentura run --verbose` | Prints per-case scores, multi-turn turn breakdowns, and tool-call details. |
| `agentura run --reset-baseline` | Overwrites `.agentura/baseline.json` with the current run. |
| `agentura run --locked` | Exits with code `1` if any dataset changed since the saved baseline. |
| `agentura run --suite <name>` | Runs only the named suite. |

## Complete example

```yaml
version: 1

agent:
  type: http
  endpoint: http://localhost:3000/api/agent
  timeout_ms: 30000

evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/accuracy.jsonl
    scorer: semantic_similarity
    threshold: 0.85

  - name: quality
    type: llm_judge
    dataset: ./evals/quality.jsonl
    rubric: ./evals/quality-rubric.md
    judge_model: claude-3-5-haiku-20241022
    runs: 3
    threshold: 0.80

  - name: tool_calls
    type: tool_use
    dataset: ./evals/tool_use.jsonl
    threshold: 0.80

  - name: performance
    type: performance
    dataset: ./evals/performance.jsonl
    max_p95_ms: 3000
    max_cost_per_call_usd: 0.01
    threshold: 1.0

ci:
  block_on_regression: true
  regression_threshold: 0.05
  compare_to: main
  post_comment: true
  fail_on_new_suite: false
```
