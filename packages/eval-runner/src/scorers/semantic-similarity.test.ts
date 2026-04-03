import assert from "node:assert/strict";
import test from "node:test";

import type { SemanticSimilarityClientFactories } from "./semantic-similarity";
import {
  GROQ_EMBEDDINGS_UNSUPPORTED_ERROR,
  NO_EMBEDDING_PROVIDER_WARNING,
  OLLAMA_EMBEDDING_MODEL_WARNING,
  resetSemanticSimilarityTestState,
  resolveSemanticSimilarityProvider,
  scoreSemanticSimilarity,
} from "./semantic-similarity";

function withConsoleWarnings(callback: (warnings: string[]) => Promise<void>): Promise<void> {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((value) => String(value)).join(" "));
  };

  return callback(warnings).finally(() => {
    console.warn = originalWarn;
  });
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

function createClientFactories(
  embeddings: Record<"openai" | "anthropic" | "gemini" | "groq" | "ollama", Record<string, number[]>>,
  onCall?: (
    provider: "openai" | "anthropic" | "gemini" | "groq" | "ollama",
    input: string,
    model: string
  ) => void
): SemanticSimilarityClientFactories {
  return {
    openai: () => ({
      embeddings: {
        create: async ({ input, model }) => {
          onCall?.("openai", input, model);
          return {
            data: [{ embedding: embeddings.openai[input] }],
          };
        },
      },
    }),
    anthropic: () => ({
      embeddings: {
        create: async ({ input, model }) => {
          onCall?.("anthropic", input, model);
          return {
            data: [{ embedding: embeddings.anthropic[input] }],
          };
        },
      },
    }),
    gemini: () => ({
      models: {
        embedContent: async ({ contents, model }) => {
          const input = contents[0] ?? "";
          onCall?.("gemini", input, model);
          return {
            embeddings: [{ values: embeddings.gemini[input] }],
          };
        },
      },
    }),
    groq: () => ({
      embeddings: {
        create: async ({ input, model }) => {
          onCall?.("groq", input, model);
          return {
            data: [{ embedding: embeddings.groq[input] }],
          };
        },
      },
    }),
    ollama: () => ({
      embeddings: {
        create: async ({ prompt, model }) => {
          onCall?.("ollama", prompt, model);
          return {
            embedding: embeddings.ollama[prompt],
          };
        },
      },
    }),
  };
}

test("resolveSemanticSimilarityProvider prefers Anthropic over other available providers", async () => {
  resetSemanticSimilarityTestState();

  assert.deepEqual(
    await resolveSemanticSimilarityProvider(
      {
        OPENAI_API_KEY: "openai-key",
        ANTHROPIC_API_KEY: "anthropic-key",
        GEMINI_API_KEY: "gemini-key",
      },
      { ollamaAvailable: true }
    ),
    {
      provider: "anthropic",
      apiKey: "anthropic-key",
      model: "voyage-3",
    }
  );
});

test("resolveSemanticSimilarityProvider uses OLLAMA_EMBED_MODEL when configured", async () => {
  resetSemanticSimilarityTestState();

  assert.deepEqual(
    await resolveSemanticSimilarityProvider({
      OLLAMA_EMBED_MODEL: "custom-embed-model",
      OLLAMA_BASE_URL: "http://localhost:11434",
    }),
    {
      provider: "ollama",
      apiKey: "",
      model: "custom-embed-model",
      baseUrl: "http://localhost:11434",
    }
  );
});

test("resolveSemanticSimilarityProvider auto-detects an installed Ollama embedding model", async () => {
  resetSemanticSimilarityTestState();

  assert.deepEqual(
    await resolveSemanticSimilarityProvider(
      {
        OLLAMA_BASE_URL: "http://localhost:11434",
      },
      {
        fetchImpl: createTagsFetch(["llama3.2", "mxbai-embed-large:latest"]),
      }
    ),
    {
      provider: "ollama",
      apiKey: "",
      model: "mxbai-embed-large:latest",
      baseUrl: "http://localhost:11434",
    }
  );
});

test("scoreSemanticSimilarity returns cosine similarity for OpenAI embeddings and caches repeated inputs", async () => {
  resetSemanticSimilarityTestState();

  const calls: Array<{ provider: string; input: string; model: string }> = [];
  const factories = createClientFactories(
    {
      openai: {
        "semantic answer": [0.8, 0.6],
        expected: [1, 0],
      },
      anthropic: {},
      gemini: {},
      groq: {},
      ollama: {},
    },
    (provider, input, model) => {
      calls.push({ provider, input, model });
    }
  );

  const firstScore = await scoreSemanticSimilarity("semantic answer", "expected", {
    env: { OPENAI_API_KEY: "openai-key" },
    clientFactories: factories,
  });
  const secondScore = await scoreSemanticSimilarity("semantic answer", "expected", {
    env: { OPENAI_API_KEY: "openai-key" },
    clientFactories: factories,
  });

  assert.equal(firstScore, 0.8);
  assert.equal(secondScore, 0.8);
  assert.deepEqual(calls, [
    {
      provider: "openai",
      input: "semantic answer",
      model: "text-embedding-3-small",
    },
    {
      provider: "openai",
      input: "expected",
      model: "text-embedding-3-small",
    },
  ]);
});

test("scoreSemanticSimilarity selects the Voyage model for the Anthropic provider path", async () => {
  resetSemanticSimilarityTestState();

  const calls: Array<{ provider: string; input: string; model: string }> = [];
  const factories = createClientFactories(
    {
      openai: {},
      anthropic: {
        "agent output": [1, 0],
        expected: [0, 1],
      },
      gemini: {},
      groq: {},
      ollama: {},
    },
    (provider, input, model) => {
      calls.push({ provider, input, model });
    }
  );

  const score = await scoreSemanticSimilarity(
    "agent output",
    "expected",
    {
      env: { ANTHROPIC_API_KEY: "anthropic-key" },
      clientFactories: factories,
    }
  );

  assert.equal(score, 0);
  assert.deepEqual(calls, [
    {
      provider: "anthropic",
      input: "agent output",
      model: "voyage-3",
    },
    {
      provider: "anthropic",
      input: "expected",
      model: "voyage-3",
    },
  ]);
});

test("scoreSemanticSimilarity selects Gemini embeddings when only GEMINI_API_KEY is available", async () => {
  resetSemanticSimilarityTestState();

  const calls: Array<{ provider: string; input: string; model: string }> = [];
  const factories = createClientFactories(
    {
      openai: {},
      anthropic: {},
      gemini: {
        actual: [1, 0],
        expected: [1, 0],
      },
      groq: {},
      ollama: {},
    },
    (provider, input, model) => {
      calls.push({ provider, input, model });
    }
  );

  const score = await scoreSemanticSimilarity(
    "actual",
    "expected",
    {
      env: { GEMINI_API_KEY: "gemini-key" },
      clientFactories: factories,
    }
  );

  assert.equal(score, 1);
  assert.deepEqual(calls, [
    {
      provider: "gemini",
      input: "actual",
      model: "text-embedding-004",
    },
    {
      provider: "gemini",
      input: "expected",
      model: "text-embedding-004",
    },
  ]);
});

test("scoreSemanticSimilarity throws an actionable error when Groq is the selected provider", async () => {
  resetSemanticSimilarityTestState();

  const calls: Array<{ provider: string; input: string; model: string }> = [];
  const factories = createClientFactories(
    {
      openai: {},
      anthropic: {},
      gemini: {},
      groq: {
        actual: [1, 0],
        expected: [1, 0],
      },
      ollama: {},
    },
    (provider, input, model) => {
      calls.push({ provider, input, model });
    }
  );

  await assert.rejects(
    () =>
      scoreSemanticSimilarity("actual", "expected", {
        env: { GROQ_API_KEY: "groq-key", OLLAMA_BASE_URL: "http://127.0.0.1:1" },
        clientFactories: factories,
      }),
    {
      message: GROQ_EMBEDDINGS_UNSUPPORTED_ERROR,
    }
  );
  assert.deepEqual(calls, []);
});

test("scoreSemanticSimilarity logs and uses Ollama when no API key exists and Ollama is reachable", async () => {
  resetSemanticSimilarityTestState();

  const calls: Array<{ provider: string; input: string; model: string }> = [];
  const logs: string[] = [];
  const originalLog = console.log;
  const originalFetch = globalThis.fetch;
  console.log = (...args: unknown[]) => {
    logs.push(args.map((value) => String(value)).join(" "));
  };
  globalThis.fetch = async () =>
    ({
      status: 200,
      ok: true,
      json: async () => ({
        models: [{ name: "mxbai-embed-large:latest" }],
      }),
    }) as Response;

  const factories = createClientFactories(
    {
      openai: {},
      anthropic: {},
      gemini: {},
      groq: {},
      ollama: {
        actual: [1, 0],
        expected: [1, 0],
      },
    },
    (provider, input, model) => {
      calls.push({ provider, input, model });
    }
  );

  try {
    const score = await scoreSemanticSimilarity(
      "actual",
      "expected",
      {
        env: {
          OLLAMA_BASE_URL: "http://localhost:11434",
        },
        clientFactories: factories,
      }
    );

    assert.equal(score, 1);
    assert.deepEqual(logs, ["semantic_similarity: using ollama (mxbai-embed-large:latest) [local]"]);
    assert.deepEqual(calls, [
      {
        provider: "ollama",
        input: "actual",
        model: "mxbai-embed-large:latest",
      },
      {
        provider: "ollama",
        input: "expected",
        model: "mxbai-embed-large:latest",
      },
    ]);
  } finally {
    console.log = originalLog;
    globalThis.fetch = originalFetch;
  }
});

test("scoreSemanticSimilarity warns once when Ollama is running without an embedding model and returns 0", async () => {
  resetSemanticSimilarityTestState();

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    ({
      status: 200,
      ok: true,
      json: async () => ({
        models: [{ name: "llama3.2" }, { name: "qwen2.5:latest" }],
      }),
    }) as Response;

  try {
    await withConsoleWarnings(async (warnings) => {
      const firstScore = await scoreSemanticSimilarity(
        "hello world from agentura",
        "hello world",
        { env: { OLLAMA_BASE_URL: "http://localhost:11434" } }
      );
      const secondScore = await scoreSemanticSimilarity(
        "hello world from agentura",
        "hello world",
        { env: { OLLAMA_BASE_URL: "http://localhost:11434" } }
      );

      assert.equal(firstScore, 0);
      assert.equal(secondScore, firstScore);
      assert.deepEqual(warnings, [OLLAMA_EMBEDDING_MODEL_WARNING]);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scoreSemanticSimilarity warns once and returns 0 when no embedding provider is present", async () => {
  resetSemanticSimilarityTestState();

  await withConsoleWarnings(async (warnings) => {
    const firstScore = await scoreSemanticSimilarity("hello world from agentura", "hello world", {
      env: {
        OLLAMA_BASE_URL: "http://127.0.0.1:1",
      },
    });
    const secondScore = await scoreSemanticSimilarity("hello world from agentura", "hello world", {
      env: {
        OLLAMA_BASE_URL: "http://127.0.0.1:1",
      },
    });

    assert.equal(firstScore, 0);
    assert.equal(secondScore, firstScore);
    assert.deepEqual(warnings, [NO_EMBEDDING_PROVIDER_WARNING]);
  });
});

test("scoreSemanticSimilarity uses fuzzy_match when allowFallback is enabled and no provider is present", async () => {
  resetSemanticSimilarityTestState();

  await withConsoleWarnings(async (warnings) => {
    const score = await scoreSemanticSimilarity("hello world from agentura", "hello world", {
      env: {
        OLLAMA_BASE_URL: "http://127.0.0.1:1",
      },
      allowFallback: true,
    });

    assert.equal(score, 0.5);
    assert.deepEqual(warnings, [
      "semantic_similarity needs an embedding provider to run.\nAdd an API key for Anthropic, OpenAI, or Gemini,\nor start Ollama locally (ollama.com).\nUsing fuzzy_match because --allow-fallback is set.",
    ]);
  });
});

test("scoreSemanticSimilarity returns 0 when the embedding request fails", async () => {
  resetSemanticSimilarityTestState();

  const factories: SemanticSimilarityClientFactories = {
    openai: () => ({
      embeddings: {
        create: async () => {
          throw new Error("boom");
        },
      },
    }),
    anthropic: () => ({
      embeddings: {
        create: async () => ({ data: [{ embedding: [1] }] }),
      },
    }),
    gemini: () => ({
      models: {
        embedContent: async () => ({ embeddings: [{ values: [1] }] }),
      },
    }),
    groq: () => ({
      embeddings: {
        create: async () => ({ data: [{ embedding: [1] }] }),
      },
    }),
    ollama: () => ({
      embeddings: {
        create: async () => ({ embedding: [1] }),
      },
    }),
  };

  await withConsoleWarnings(async (warnings) => {
    const score = await scoreSemanticSimilarity(
      "The free plan includes 3 projects.",
      "3 projects",
      {
        env: { OPENAI_API_KEY: "openai-key" },
        clientFactories: factories,
      }
    );

    assert.equal(score, 0);
    assert.equal(warnings.length, 1);
    assert.match(
      warnings[0] ?? "",
      /semantic_similarity could not get embeddings from openai \(boom\)\.\nScores will be 0 for this suite\.\nRun again with --allow-fallback to use fuzzy_match instead\./
    );
  });
});

test("scoreSemanticSimilarity uses fuzzy_match when allowFallback is enabled after an embedding failure", async () => {
  resetSemanticSimilarityTestState();

  const factories: SemanticSimilarityClientFactories = {
    openai: () => ({
      embeddings: {
        create: async () => {
          throw new Error("boom");
        },
      },
    }),
    anthropic: () => ({
      embeddings: {
        create: async () => ({ data: [{ embedding: [1] }] }),
      },
    }),
    gemini: () => ({
      models: {
        embedContent: async () => ({ embeddings: [{ values: [1] }] }),
      },
    }),
    groq: () => ({
      embeddings: {
        create: async () => ({ data: [{ embedding: [1] }] }),
      },
    }),
    ollama: () => ({
      embeddings: {
        create: async () => ({ embedding: [1] }),
      },
    }),
  };

  await withConsoleWarnings(async (warnings) => {
    const score = await scoreSemanticSimilarity(
      "The free plan includes 3 projects.",
      "3 projects",
      {
        env: { OPENAI_API_KEY: "openai-key" },
        clientFactories: factories,
        allowFallback: true,
      }
    );

    assert.equal(score, 1 / 3);
    assert.deepEqual(warnings, [
      "semantic_similarity could not get embeddings from openai (boom).\nUsing fuzzy_match because --allow-fallback is set.",
    ]);
  });
});

test("scoreSemanticSimilarity handles empty strings without embedding calls", async () => {
  resetSemanticSimilarityTestState();

  let called = false;
  const options = {
    env: { OPENAI_API_KEY: "openai-key" },
    clientFactories: createClientFactories(
      {
        openai: {},
        anthropic: {},
        gemini: {},
        groq: {},
        ollama: {},
      },
      () => {
        called = true;
      }
    ),
  };
  assert.equal(await scoreSemanticSimilarity("", "", options), 1);
  assert.equal(await scoreSemanticSimilarity("", "non-empty", options), 0);
  assert.equal(await scoreSemanticSimilarity("non-empty", "", options), 0);
  assert.equal(called, false);
});
