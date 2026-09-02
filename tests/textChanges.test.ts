import assert from "node:assert/strict";
import test from "node:test";

import { minimalTextChange } from "../src/lib/textChanges.js";

test("returns the smallest contiguous replacement", () => {
  assert.deepEqual(
    minimalTextChange("before [ ] after", "before [x] after"),
    { from: 8, to: 9, insert: "x" },
  );
});

test("handles insertion, deletion, and identical text", () => {
  assert.deepEqual(minimalTextChange("task", "tasks"), {
    from: 4,
    to: 4,
    insert: "s",
  });
  assert.deepEqual(minimalTextChange("tasks", "task"), {
    from: 4,
    to: 5,
    insert: "",
  });
  assert.equal(minimalTextChange("same", "same"), null);
});
