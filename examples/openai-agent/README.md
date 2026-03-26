# OpenAI Agent Example

[Back to Agentura](../../README.md)

Eval an OpenAI agent in 5 minutes.

## Setup
```bash
cd examples/openai-agent
npm install
export OPENAI_API_KEY=sk-...
# optional: export ANTHROPIC_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY for llm_judge
```

## Start the agent
```bash
npm start
```

## Run evals (in a second terminal)
```bash
npx agentura@latest run --local
```

## What you will see
The `accuracy` suite should show a mix of obvious passes and obvious misses, `quality` will score tone and helpfulness with the first available judge provider key, `conversation` will replay multi-turn threads with request `history`, and `performance` will report whether the local HTTP agent stayed under the latency and cost limits.

## Without an API key
This sample agent itself still needs OPENAI_API_KEY to answer requests. Golden dataset evals run without any judge API key.  
LLM judge suites require one of: ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY
