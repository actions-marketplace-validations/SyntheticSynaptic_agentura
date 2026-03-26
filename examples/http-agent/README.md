# HTTP Agent Example

[Back to Agentura](../../README.md)

Works with any language, any framework, any LLM.

## Setup
```bash
cd examples/http-agent
npm install
```

## Start the agent
```bash
npm start
```

## Run evals (in a second terminal)
```bash
npx agentura run --local
```

## What you will see
Agentura will hit a plain HTTP endpoint, score ten golden dataset cases, and print a local pass/fail summary with zero signup and zero cloud dependencies.

## Swap the backend
You can replace `agent.ts` with a Python Flask server, a Go HTTP handler, or a deployed endpoint later. As long as it accepts `POST /invoke` with `{ "input": "..." }` and returns `{ "output": "..." }`, the eval flow stays the same.
