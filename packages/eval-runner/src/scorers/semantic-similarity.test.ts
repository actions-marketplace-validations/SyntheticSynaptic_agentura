import assert from "node:assert/strict";
import test from "node:test";

import { scoreSemanticSimilarity } from "./semantic-similarity";

test("identical strings return 1.0", () => {
  assert.equal(scoreSemanticSimilarity("hello world", "hello world"), 1);
});

test("completely different strings return 0.0", () => {
  assert.equal(scoreSemanticSimilarity("cat", "airplane"), 0);
});

test("partial overlap returns value between 0 and 1", () => {
  const score = scoreSemanticSimilarity("hello world from agentura", "hello world");
  assert.ok(score > 0 && score < 1);
});

test("both empty strings return 1.0", () => {
  assert.equal(scoreSemanticSimilarity("", ""), 1);
});

test("one empty string returns 0.0", () => {
  assert.equal(scoreSemanticSimilarity("", "non-empty"), 0);
  assert.equal(scoreSemanticSimilarity("non-empty", ""), 0);
});
