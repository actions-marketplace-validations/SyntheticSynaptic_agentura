# Quick Start — Zero to First Green Check in 5 Minutes

## Step 0 — Try it in 60 seconds (no signup required)

```bash
npx agentura@latest init
npx agentura@latest run --local
```

The `--local` flag runs evals entirely on your machine — no login, no GitHub App, no cloud calls required. Perfect for development.

## Prerequisites

- A GitHub repo with an AI agent
- Your agent must be callable through one of Agentura's supported modes: `http`, `cli`, or `sdk`
- For the GitHub App flow below, you need permission to install apps on the repo

## Step 1 — Install the GitHub App

Click: [Install Agentura GitHub App](https://github.com/apps/agenturaci/installations/new)

Select the repos you want to monitor. After install, you will be redirected to the Agentura dashboard.

## Step 2 — Create `agentura.yaml`

Add this file to your repo root:

```yaml
version: 1

agent:
  type: http
  endpoint: https://your-agent.example.com/api/agent
  timeout_ms: 10000

evals:
  - name: accuracy
    type: golden_dataset
    dataset: ./evals/accuracy.jsonl
    scorer: semantic_similarity
    threshold: 0.85

ci:
  block_on_regression: false
  compare_to: main
  post_comment: true
```

Replace the endpoint with your agent's URL.

## Step 3 — Create your eval dataset

Create `evals/accuracy.jsonl` with one JSON object per line:

```json
{"input": "what is 2+2", "expected": "4"}
{"input": "what is the capital of France", "expected": "Paris"}
```

Each line includes:

- `input`: the prompt sent to your agent
- `expected`: the expected answer

## Step 4 — Open a PR

Commit `agentura.yaml` and your dataset on a new branch, then open a pull request.

Agentura will fetch your config, run the suites, compare against the saved baseline, and post the results back to the PR.

## Step 5 — See results

Within about 30 to 90 seconds you should see:

- A GitHub Check Run (green or red)
- A PR comment with suite scores, thresholds, and regression details

From that point on, every qualifying PR gets the same eval gate automatically.

## Next steps

- [Configure eval strategies](./strategies.md)
- [Full agentura.yaml reference](./agentura-yaml.md)
- [Self-hosting and local inference](./self-hosting.md)
