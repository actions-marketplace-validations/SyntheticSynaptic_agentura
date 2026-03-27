# Heterogeneous Consensus Runtime

Agentura can route one input through multiple model families, compare their outputs,
and treat disagreement as a safety signal instead of assuming one model is correct.

Consensus is useful when:

- the task is high stakes and silent model mistakes are costly
- disagreement itself should trigger human review
- you want a deterministic fallback instead of trusting one stochastic sample

## Runtime config

Add an optional top-level `consensus` block to `agentura.yaml`:

```yaml
consensus:
  models:
    - provider: anthropic
      model: claude-sonnet-4-6
    - provider: openai
      model: gpt-4o
    - provider: google
      model: gemini-pro
  agreement_threshold: 0.80
  on_disagreement: flag
  scope: high_stakes_only
  high_stakes_tools:
    - retrieve_patient_record
    - generate_recommendation
```

Fields:

- `models`: the heterogeneous provider/model set to run in parallel
- `agreement_threshold`: minimum mean pairwise semantic similarity required for agreement
- `on_disagreement`: `flag`, `escalate`, or `reject`
- `scope`: `all` or `high_stakes_only`
- `high_stakes_tools`: tool names that should trigger consensus when `scope` is `high_stakes_only`

## Selection logic

`runConsensus(input, models, config)` returns:

```ts
interface ConsensusResult {
  winning_response: string
  agreement_rate: number
  responses: ModelResponse[]
  dissenting_models: string[]
  flag: TraceFlag | null
}
```

Agentura chooses a winner in two passes:

1. If there is a strict majority on normalized text, use majority vote.
2. Otherwise, treat the outputs as open-ended and choose the response with the highest
   mean semantic similarity to every other response.

If the final `agreement_rate` is below the configured threshold, Agentura still returns
the best available answer, but it also attaches a `consensus_disagreement` flag so the
result can be reviewed.

## Degraded mode

Consensus still runs if one provider fails.

- provider calls are parallel and independent
- failed providers are recorded inside `responses`
- Agentura adds a `degraded_consensus` flag to the trace
- agreement is computed from the remaining successful responses

If fewer than two providers succeed, Agentura records the run as degraded and the
agreement rate falls below threshold by design.

## CLI

Run a one-off consensus check:

```bash
pnpm agentura consensus \
  --input "What is the recommended next step for this patient?" \
  --models anthropic:claude-sonnet-4-6,openai:gpt-4o,google:gemini-pro \
  --threshold 0.80
```

Output looks like:

```text
✓ Consensus reached (agreement: 0.92)
  Response: "Order a repeat echocardiogram in 6 months..."
```

or:

```text
⚠ Disagreement detected (agreement: 0.61)
  anthropic:claude-sonnet-4-6: "Order CPET now"
  openai:gpt-4o: "Watchful waiting for 6 months"
  google:gemini-pro: "Order CPET now"
  Winning: "Order CPET now"
  Flag: consensus_disagreement
```

Each CLI run writes a normal trace under `.agentura/traces/` with a populated
`consensus_result`.

## Eval strategy

Consensus can also be evaluated as a suite:

```yaml
evals:
  - name: consensus_check
    type: consensus
    dataset: ./evals/high_stakes.jsonl
    models:
      - provider: anthropic
        model: claude-sonnet-4-6
      - provider: openai
        model: gpt-4o
    threshold: 0.80
```

Each JSONL row only needs an `input` field:

```json
{"input":"What is the recommended next step for this patient with worsening dyspnea?"}
```

The suite fails if any case lands below the configured agreement threshold.

## Environment

Consensus provider calls use the same provider credentials you already use elsewhere:

- Anthropic: `ANTHROPIC_API_KEY`
- OpenAI: `OPENAI_API_KEY`
- Google: `GEMINI_API_KEY` or `GOOGLE_API_KEY`
