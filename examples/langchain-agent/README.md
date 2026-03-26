# LangChain Agent Example

[Back to Agentura](../../README.md)

Eval a LangChain agent in 5 minutes.

## Setup
```bash
cd examples/langchain-agent
npm install
export OPENAI_API_KEY=sk-...
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
The `accuracy` suite mixes plain-language questions with math problems, while `tool_use` checks whether the agent exposed the `[tool:calculator]` marker that signals the calculator tool actually ran.

## Without an API key
This example's agent itself requires OPENAI_API_KEY because LangChain is calling OpenAI under the hood. The current suites do not need a separate judge key, but if you add `llm_judge` suites later you can use ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY.
