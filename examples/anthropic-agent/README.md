# Anthropic Claude Agent Example

[Back to Agentura](../../README.md)

Demonstrates multi-turn conversation eval - testing whether agent behavior stays consistent across a realistic multi-step support workflow.

## Why multi-turn eval matters

Single-turn evals only check if an agent answers one question correctly. Multi-turn evals catch the failures that actually matter in production:

- Does the agent honor constraints from turn 1 in turn 4?
- Does it maintain account-tier context across multiple questions?
- Does it stay consistent under conversational pressure?

## What this example tests

- `accuracy`: basic single-turn support questions
- `consistency`: multi-turn workflows testing constraint adherence and context carryover
- `quality`: `llm_judge` evaluating helpfulness and tone with majority vote (`runs: 3`)

## Setup

```bash
cd examples/anthropic-agent
npm install
export ANTHROPIC_API_KEY=sk-ant-...
```

## Start the agent

```bash
npm start
```

## Run evals (in a second terminal)

```bash
npx agentura@latest run --local
```

## Multi-turn eval format

The `conversation.jsonl` file uses Agentura's multi-turn format:

```json
{
  "conversation": [
    {"role": "user", "content": "We are on the Pro tier."},
    {"role": "assistant", "expected": "Got it, I will keep the Pro tier in mind."},
    {"role": "user", "content": "How much storage do we get on our plan?"},
    {"role": "assistant", "expected": "Pro includes 100GB storage."}
  ],
  "eval_turns": [2, 4]
}
```

## Without an API key

The `accuracy` suite (`fuzzy_match` scorer) runs without any API key.
The `quality` suite (`llm_judge`) and the agent itself require `ANTHROPIC_API_KEY`.
The same key powers both - no extra configuration needed.
