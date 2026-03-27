# Production Trace Layer

Agentura can now capture structured runtime traces for ad hoc agent calls and failed local eval cases.

## Schema

Every trace file stores a single `AgentTrace` object:

```ts
interface AgentTrace {
  trace_id: string
  run_id: string
  agent_id: string
  model: string
  model_version: string
  prompt_hash: string
  started_at: string
  completed_at: string
  input: string
  output: string
  tool_calls: ToolCallRecord[]
  token_usage: { input: number; output: number }
  duration_ms: number
  flags: TraceFlag[]
  consensus_result?: ConsensusResult | null
}
```

`tool_calls` record the tool name, input/output payloads, timestamps, and any resource IDs accessed during the call.

`flags` currently support:

- `consensus_disagreement`
- `degraded_consensus`
- `no_tool_call_expected`
- `latency_exceeded`

When a trace comes from `agentura consensus` or from a consensus-backed eval suite,
`consensus_result` stores the per-model responses, agreement rate, winning response,
and any dissenting models so disagreements can be audited later.

## CLI commands

Capture a trace from a local SDK-style agent module:

```bash
npx agentura trace \
  --agent ./agent.ts \
  --input "summarize patient history" \
  --model claude-sonnet-4-6 \
  --verbose
```

Options:

- `--model <name>` overrides the model passed to the agent
- `--out <dir>` changes the trace output directory (default: `.agentura/traces`)
- `--verbose` prints the final trace JSON to stdout
- `--redact` replaces string values under PII-like keys (`name`, `dob`, `mrn`, `ssn`, `address`) inside traced tool outputs with `[REDACTED]`

Compare two trace files:

```bash
npx agentura trace diff <trace_id_a> <trace_id_b>
```

The diff output includes:

- output semantic similarity
- tool calls added, removed, or changed
- token usage delta
- duration delta

## Trace storage

Normal traces are written to date buckets:

```text
.agentura/traces/YYYY-MM-DD/<trace_id>.json
```

Failed local eval cases are copied to:

```text
.agentura/traces/eval-failures/YYYY-MM-DD/<trace_id>.json
```

Each written trace is also summarized into `.agentura/manifest.json` so later reporting and `trace diff` lookups can find it by `trace_id`.

## Eval failure capture

When `agentura run --local` fails a case, Agentura automatically stores a trace for that failure and prints:

```text
↳ 3 failed cases written to .agentura/traces/eval-failures/
```

These traces are intended to seed future eval cases, audit unexpected tool behavior, and inspect low-agreement or latency-related failures.

## Example

See [`examples/openai-agent/trace-example.ts`](../examples/openai-agent/trace-example.ts) for a traced agent that:

- exports `model`, `modelVersion`, and `systemPrompt`
- returns `tool_calls` with `data_accessed`
- produces a stable `promptHash`
- works with `agentura trace --redact`
