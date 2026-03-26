import assert from "node:assert/strict";
import test from "node:test";

import {
  NO_LLM_JUDGE_API_KEY_WARNING,
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
  };
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

test("resolveLlmJudgeProvider prioritizes anthropic over other provider keys", () => {
  const judge = resolveLlmJudgeProvider({
    ANTHROPIC_API_KEY: "anthropic-key",
    OPENAI_API_KEY: "openai-key",
    GEMINI_API_KEY: "gemini-key",
    GROQ_API_KEY: "groq-key",
  });

  assert.deepEqual(judge, {
    provider: "anthropic",
    apiKey: "anthropic-key",
    model: "claude-3-5-haiku-20241022",
  });
});

test("resolveLlmJudgeProvider returns null and keeps the exact warning text when no key exists", () => {
  assert.equal(resolveLlmJudgeProvider({}), null);
  assert.equal(
    NO_LLM_JUDGE_API_KEY_WARNING,
    "llm_judge suites skipped: set ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY, or GROQ_API_KEY to run them"
  );
});

test("scoreLlmJudge uses the anthropic client and configured model", async () => {
  const calls: Array<{ provider: string; model: string }> = [];

  const result = await scoreLlmJudge(
    "What is 2+2?",
    "It is 4",
    "Give full score for correct answers.",
    createJudge("anthropic", "claude-3-5-haiku-20241022"),
    undefined,
    createClientFactories('{"score":0.9,"reason":"Correct and concise."}', calls)
  );

  assert.equal(result.score, 0.9);
  assert.equal(result.reason, "Correct and concise.");
  assert.deepEqual(calls, [{ provider: "anthropic", model: "claude-3-5-haiku-20241022" }]);
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
