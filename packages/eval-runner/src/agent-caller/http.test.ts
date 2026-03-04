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
