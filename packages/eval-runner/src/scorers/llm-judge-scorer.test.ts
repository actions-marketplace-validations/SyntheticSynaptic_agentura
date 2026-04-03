import assert from "node:assert/strict";
import test from "node:test";

import { resetOllamaTestState } from "./ollama";
import {
  NO_LLM_JUDGE_API_KEY_WARNING,
  formatLlmJudgeProviderLogMessage,
  resolveLlmJudgeProvider,
  scoreLlmJudge,
  type LlmJudgeClientFactories,
  type ResolvedLlmJudgeProvider,
} from "./llm-judge-scorer";

type MockResponseText = string;

function createClientFactories(
  responseText: MockResponseText,
  calls: Array<{ provider: string; model: string }>
): LlmJudgeClientFactories {
  return {
    anthropic: () => ({
      messages: {
        create: async (params) => {
          calls.push({ provider: "anthropic", model: params.model });
          return {
            content: [
              {
                type: "text",
                text: responseText,
              },
            ],
          };
        },
      },
    }),
    openai: () => ({
      chat: {
        completions: {
          create: async (params) => {
            calls.push({ provider: "openai", model: params.model });
            return {
              choices: [
                {
                  message: {
                    content: responseText,
                  },
                },
              ],
            };
          },
        },
      },
    }),
    gemini: () => ({
      models: {
        generateContent: async (params) => {
          calls.push({ provider: "gemini", model: params.model });
          return {
            text: responseText,
          };
        },
      },
    }),
    groq: () => ({
      chat: {
        completions: {
          create: async (params) => {
            calls.push({ provider: "groq", model: params.model });
            return {
              choices: [
                {
                  message: {
                    content: responseText,
                  },
                },
              ],
            };
          },
        },
      },
    }),
    ollama: () => ({
      chat: async (params) => {
        calls.push({ provider: "ollama", model: params.model });
        return {
          message: {
            content: responseText,
          },
        };
      },
    }),
  };
}

function createTagsFetch(modelNames: string[]): typeof fetch {
  return (async () =>
    ({
      status: 200,
      json: async () => ({
        models: modelNames.map((name) => ({ name })),
      }),
    }) as Response) as typeof fetch;
}

function createJudge(
  provider: ResolvedLlmJudgeProvider["provider"],
  model: string
): ResolvedLlmJudgeProvider {
  return {
    provider,
    model,
    apiKey: "test-key",
  };
}

test("resolveLlmJudgeProvider prioritizes anthropic over other provider keys", async () => {
  resetOllamaTestState();

  const judge = await resolveLlmJudgeProvider(
    {
      ANTHROPIC_API_KEY: "anthropic-key",
      OPENAI_API_KEY: "openai-key",
      GEMINI_API_KEY: "gemini-key",
      GROQ_API_KEY: "groq-key",
    },
    { ollamaAvailable: true }
  );

  assert.deepEqual(judge, {
    provider: "anthropic",
    apiKey: "anthropic-key",
    model: "claude-haiku-4-5-20251001",
  });
});

test("resolveLlmJudgeProvider uses OLLAMA_MODEL when no remote provider key exists", async () => {
  resetOllamaTestState();

  const judge = await resolveLlmJudgeProvider(
    {
      OLLAMA_MODEL: "qwen2.5-coder:7b",
      OLLAMA_BASE_URL: "http://localhost:11434",
    }
  );

  assert.deepEqual(judge, {
    provider: "ollama",
    apiKey: "",
    model: "qwen2.5-coder:7b",
    baseUrl: "http://localhost:11434",
  });
  assert.equal(
    formatLlmJudgeProviderLogMessage(judge),
    "llm_judge: using ollama (qwen2.5-coder:7b) [local]"
  );
});

test("resolveLlmJudgeProvider auto-detects the first installed local judge model", async () => {
  resetOllamaTestState();

  const judge = await resolveLlmJudgeProvider(
    {
      OLLAMA_BASE_URL: "http://localhost:11434",
    },
    {
      fetchImpl: createTagsFetch([
        "mxbai-embed-large:latest",
        "llama3.2:cloud",
        "qwen2.5:latest",
      ]),
    }
  );

  assert.deepEqual(judge, {
    provider: "ollama",
    apiKey: "",
    model: "qwen2.5:latest",
    baseUrl: "http://localhost:11434",
  });
});

test("resolveLlmJudgeProvider returns null when Ollama has no usable local judge model", async () => {
  resetOllamaTestState();

  const judge = await resolveLlmJudgeProvider(
    {
      OLLAMA_BASE_URL: "http://localhost:11434",
    },
    {
      fetchImpl: createTagsFetch([
        "mxbai-embed-large:latest",
        "nomic-embed-text",
        "llama3.2:cloud",
      ]),
    }
  );

  assert.equal(judge, null);
});

test("resolveLlmJudgeProvider returns null and keeps the exact warning text when no provider exists", async () => {
  resetOllamaTestState();

  assert.equal(await resolveLlmJudgeProvider({}, { ollamaAvailable: false }), null);
  assert.equal(
    NO_LLM_JUDGE_API_KEY_WARNING,
    "llm_judge needs a language model to run.\nAdd an API key for Anthropic, OpenAI, Gemini, or Groq,\nor start Ollama locally (ollama.com).\nThis suite will be skipped."
  );
});

test("scoreLlmJudge uses the anthropic client and configured model", async () => {
  const calls: Array<{ provider: string; model: string }> = [];

  const result = await scoreLlmJudge(
    "What is 2+2?",
    "It is 4",
    "Give full score for correct answers.",
    createJudge("anthropic", "claude-haiku-4-5-20251001"),
    undefined,
    createClientFactories('{"score":0.9,"reason":"Correct and concise."}', calls)
  );

  assert.equal(result.score, 0.9);
  assert.equal(result.reason, "Correct and concise.");
  assert.deepEqual(calls, [{ provider: "anthropic", model: "claude-haiku-4-5-20251001" }]);
});

test("scoreLlmJudge uses the openai client and configured model", async () => {
  const calls: Array<{ provider: string; model: string }> = [];

  const result = await scoreLlmJudge(
    "Question",
    "Answer",
    "Rubric",
    createJudge("openai", "gpt-4o-mini"),
    undefined,
    createClientFactories('{"score":0.75,"reason":"Solid."}', calls)
  );

  assert.equal(result.score, 0.75);
  assert.equal(result.reason, "Solid.");
  assert.deepEqual(calls, [{ provider: "openai", model: "gpt-4o-mini" }]);
});

test("scoreLlmJudge uses the gemini client and configured model", async () => {
  const calls: Array<{ provider: string; model: string }> = [];

  const result = await scoreLlmJudge(
    "Question",
    "Answer",
    "Rubric",
    createJudge("gemini", "gemini-2.0-flash"),
    undefined,
    createClientFactories('{"score":0.6,"reason":"Adequate."}', calls)
  );

  assert.equal(result.score, 0.6);
  assert.equal(result.reason, "Adequate.");
  assert.deepEqual(calls, [{ provider: "gemini", model: "gemini-2.0-flash" }]);
});

test("scoreLlmJudge uses the ollama client and configured model", async () => {
  const calls: Array<{ provider: string; model: string }> = [];

  const result = await scoreLlmJudge(
    "Question",
    "Answer",
    "Rubric",
    {
      ...createJudge("ollama", "llama3.2"),
      baseUrl: "http://localhost:11434",
    },
    undefined,
    createClientFactories('{"score":0.88,"reason":"Local model passed."}', calls)
  );

  assert.equal(result.score, 0.88);
  assert.equal(result.reason, "Local model passed.");
  assert.deepEqual(calls, [{ provider: "ollama", model: "llama3.2" }]);
});

test("scoreLlmJudge returns parse error on invalid JSON", async () => {
  const result = await scoreLlmJudge(
    "Question",
    "Answer",
    "Rubric",
    createJudge("groq", "llama-3.1-8b-instant"),
    undefined,
    createClientFactories("not-json", [])
  );

  assert.equal(result.score, 0);
  assert.equal(result.reason, "Judge response parse error");
});

test("scoreLlmJudge clamps score above 1 to 1", async () => {
  const result = await scoreLlmJudge(
    "Question",
    "Answer",
    "Rubric",
    createJudge("groq", "llama-3.1-8b-instant"),
    undefined,
    createClientFactories('{"score":1.8,"reason":"Too high"}', [])
  );

  assert.equal(result.score, 1);
  assert.equal(result.reason, "Too high");
});

test("scoreLlmJudge clamps score below 0 to 0", async () => {
  const result = await scoreLlmJudge(
    "Question",
    "Answer",
    "Rubric",
    createJudge("groq", "llama-3.1-8b-instant"),
    undefined,
    createClientFactories('{"score":-2,"reason":"Too low"}', [])
  );

  assert.equal(result.score, 0);
  assert.equal(result.reason, "Too low");
});
