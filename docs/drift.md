# Drift Detection

Frozen references let you measure how much an agent's behavior has moved since a known-good version.

Use this when you are about to:

- change a prompt
- upgrade a model
- adjust tool routing
- change policies or safety instructions

Agentura stores a frozen reference snapshot locally under `.agentura/reference/<label>/` and compares future runs against that snapshot's saved inputs.

## Capture a reference

```bash
agentura reference snapshot \
  --agent ./agent.ts \
  --dataset ./evals/accuracy.jsonl \
  --label v1.0-pre-prompt-change
```

This writes:

- `.agentura/reference/v1.0-pre-prompt-change/outputs.jsonl`
- `.agentura/reference/v1.0-pre-prompt-change/metadata.json`

Snapshots are immutable. Reuse a new label for a new baseline, or pass `--force` if you intentionally want to replace an existing local snapshot.

## Compare against a reference

```bash
agentura reference diff --against v1.0-pre-prompt-change
```

Agentura re-runs the current agent on the frozen snapshot inputs and reports:

- `semantic_drift`: mean similarity between current and reference outputs
- `tool_call_drift`: Jaccard similarity across tool-call patterns
- `latency_drift_ms`: p95 latency increase versus the reference

If any threshold is breached, the command exits with code `1`.

## Configure thresholds in `agentura.yaml`

```yaml
drift:
  reference: v1.0-pre-prompt-change
  thresholds:
    semantic_drift: 0.85
    tool_call_drift: 0.90
    latency_drift_ms: 200
```

## Run drift checks as part of a local eval run

```bash
agentura run --local --drift-check
```

When `--drift-check` is enabled:

- Agentura runs the configured eval suites
- then compares the current agent to `drift.reference`
- exits with code `1` if any drift threshold is breached
- writes the drift summary into `.agentura/manifest.json`

Example manifest section:

```json
{
  "drift": {
    "reference_label": "v1.0-pre-prompt-change",
    "semantic_drift": 0.94,
    "tool_call_drift": 0.98,
    "latency_drift_ms": 120,
    "divergent_cases": ["case_4", "case_7"],
    "threshold_breaches": ["latency_drift"]
  }
}
```

## Drift history

Every successful comparison is appended to `.agentura/reference/history.json`.

Print the recorded comparisons with:

```bash
agentura reference history
```

## Notes

- Reference snapshots are local files, not cloud state.
- The comparison uses the frozen snapshot inputs, even if the original dataset file changes later.
- Dataset versioning still matters. Drift detection answers "did outputs change for the same inputs?" not "did my eval inputs change?"
