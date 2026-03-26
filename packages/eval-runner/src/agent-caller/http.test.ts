import assert from "node:assert/strict";
import test from "node:test";

import { callHttpAgent } from "./http";

test("callHttpAgent returns errorMessage on timeout instead of throwing", async () => {
  const fetchImpl: typeof fetch = ((_url, init) => {
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;

      signal?.addEventListener("abort", () => {
        const abortError = new Error("The operation was aborted");
        abortError.name = "AbortError";
        reject(abortError);
      });
    });
  }) as typeof fetch;

  const result = await callHttpAgent({
    endpoint: "http://agent.local/test",
    input: "ping",
    timeoutMs: 50,
    fetchImpl,
  });

  assert.equal(result.output, null);
  assert.equal(typeof result.errorMessage, "string");
  assert.match(result.errorMessage ?? "", /timed out/i);
});

test("callHttpAgent preserves structured tool_calls when the agent response includes them", async () => {
  const fetchImpl: typeof fetch = (async () =>
    new Response(
      JSON.stringify({
        output: "The answer is 51",
        tool_calls: [
          {
            name: "calculator",
            args: { expression: "340 * 0.15" },
            result: "51",
          },
        ],
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      }
    )) as typeof fetch;

  const result = await callHttpAgent({
    endpoint: "http://agent.local/test",
    input: "What is 15% of 340?",
    fetchImpl,
  });

  assert.equal(result.output, "The answer is 51");
  assert.deepEqual(result.tool_calls, [
    {
      name: "calculator",
      args: { expression: "340 * 0.15" },
      result: "51",
    },
  ]);
});

test("callHttpAgent sends history in the request payload when provided", async () => {
  let body: unknown;

  const fetchImpl: typeof fetch = (async (_url, init) => {
    body = JSON.parse(String(init?.body ?? "{}"));
    return new Response(JSON.stringify({ output: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;

  await callHttpAgent({
    endpoint: "http://agent.local/test",
    input: "Actually, can I pause it instead?",
    history: [
      { role: "user", content: "I want to cancel my subscription" },
      { role: "assistant", content: "I can help with that." },
    ],
    fetchImpl,
  });

  assert.deepEqual(body, {
    input: "Actually, can I pause it instead?",
    history: [
      { role: "user", content: "I want to cancel my subscription" },
      { role: "assistant", content: "I can help with that." },
    ],
  });
});
