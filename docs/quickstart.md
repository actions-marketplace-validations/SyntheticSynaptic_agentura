# Quick Start — Zero to First Green Check in 5 Minutes

## Prerequisites

- A GitHub repo with an AI agent that has an HTTP endpoint
- The agent accepts POST requests with `{ "input": "..." }` and returns `{ "output": "..." }`
- That's it

## Step 1 — Install the GitHub App

Click: [Install Agentura GitHub App](https://github.com/apps/agenturaci/installations/new)

Select the repos you want to monitor.
You'll be redirected to your Agentura dashboard.

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
    scorer: exact_match
    threshold: 0.8

ci:
  block_on_regression: false
  compare_to: main
  post_comment: true
```

Replace the endpoint with your agent's URL.

## Step 3 — Create your eval dataset

Create `evals/accuracy.jsonl` with one test case per line:

```json
{"input": "what is 2+2", "expected": "4"}
{"input": "what is the capital of France", "expected": "Paris"}
```

Each line is a JSON object with:

- `input`: the prompt sent to your agent
- `expected`: the expected response

## Step 4 — Open a PR

Push `agentura.yaml` and your dataset to a new branch.
Open a pull request.
Agentura will automatically run your evals and post results.

## Step 5 — See results

Within ~30 seconds you'll see:

- A GitHub Check Run (green ✅ or red ❌)
- A PR comment with the detailed results table

That's it. Every future PR will automatically run your evals.

## Next steps

- [Configure eval strategies](./strategies.md)
- [Full agentura.yaml reference](./agentura-yaml.md)
- [Run evals locally with the CLI](../packages/cli)
