import assert from "node:assert/strict";
import test from "node:test";

import { scoreContains } from "./contains";

test("scoreContains returns 1 when output contains expected substring", () => {
  assert.equal(scoreContains("The quick brown fox", "brown"), 1);
});

test("scoreContains returns 0 when output does not contain expected substring", () => {
  assert.equal(scoreContains("The quick brown fox", "zebra"), 0);
});
