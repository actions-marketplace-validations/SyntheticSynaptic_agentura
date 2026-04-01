# Clinical Audit Report

Agentura can turn local eval evidence into a single self-contained HTML report for clinical governance review.

Use this when a CMIO, quality lead, or regulator needs one artifact that answers:

- what the agent did
- what evidence it accessed
- whether it behaved consistently
- whether drift from a frozen reference stayed inside policy

## Generate a report

```bash
agentura report --out clinical-audit-latest.html
agentura report --format md --out clinical-audit-latest.md
agentura report \
  --since 2026-03-01 \
  --reference v1.0-pre-prompt-change \
  --out clinical-audit-2026-03.html
```

Required flag:

- `--out`: output report file path

Optional flags:

- `--since`: include evidence on or after this date. Defaults to the earliest
  local audit evidence date.
- `--reference`: frozen reference label used for drift reporting. Defaults to
  `drift.reference` in `agentura.yaml`, or the sole local reference snapshot
  when only one exists.
- `--format md`: render the same report in GitHub-friendly markdown instead of
  HTML.

The generated file is fully self-contained:

- inline CSS only
- inline SVG only
- no CDN assets
- no external network calls

## What the report includes

1. Summary header
   - agent name, model summary, date range
   - total runs, total traces, eval pass rate
   - mean consensus agreement rate
   - drift status versus the selected frozen reference
2. Evaluation record
   - per-suite cases, pass rate, and baseline delta
   - dataset hashes to prove the evaluated inputs stayed fixed
3. Consensus log
   - total consensus calls
   - disagreement rate
   - top disagreement cases with redacted inputs
4. Drift report
   - semantic drift sparkline
   - markdown export replaces the sparkline with a drift trend table
   - tool-call pattern additions and removals
   - divergent case list
5. PCCP Readiness Signals
   - eval coverage
   - baseline stability
   - contract enforcement
   - drift status
   - model version consistency
6. Trace sample
   - representative passing and flagged traces
   - input, output, tools called, flags, and duration
7. System record
   - observed model versions by date
   - prompt hashes by date
   - dataset versions by date

## Evidence sources

The report is built from local Agentura artifacts:

- `.agentura/eval-runs/` — immutable per-run audit records written by `agentura run --local`
- `.agentura/traces/` — ad hoc and failed-case traces
- `.agentura/reference/history.json` — historical drift comparisons
- `.agentura/reference/<label>/` — frozen reference snapshot metadata and outputs

## Redaction

Report rendering applies the same redaction key set used by trace capture:

- `name`
- `dob`
- `mrn`
- `ssn`
- `address`

Structured tool payloads and matching labeled strings in trace inputs and outputs are replaced with `[REDACTED]` before being written into the HTML artifact.

## Suggested workflow

1. Run local evals as usual with `agentura run --local`
2. Capture or refresh a frozen reference with `agentura reference snapshot`
3. Run drift checks with `agentura reference diff` or `agentura run --local --drift-check`
4. Generate the monthly or release-specific audit report with `agentura report`

The resulting HTML file is intended to be easy to archive, email, or attach to internal review packets without depending on the dashboard.
