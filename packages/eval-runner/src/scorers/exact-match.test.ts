import assert from "node:assert/strict";
import test from "node:test";

import { scoreExactMatch } from "./exact-match";

test("scoreExactMatch returns 1 for matching strings", () => {
  assert.equal(scoreExactMatch("hello", "hello"), 1);
});

test("scoreExactMatch returns 0 for different strings", () => {
  assert.equal(scoreExactMatch("hello", "world"), 0);
});
