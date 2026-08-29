import assert from "node:assert/strict";
import test from "node:test";

import { taskColorStyle } from "../src/lib/taskColors.js";

test("builds theme-aware task color styles", () => {
  assert.equal(
    taskColorStyle("WAITING", { WAITING: "orange" }),
    "background-color: var(--task-color-orange-bg); color: var(--task-color-orange-text);",
  );
});

test("falls back to grey for unknown task colors", () => {
  assert.equal(
    taskColorStyle("CUSTOM", { CUSTOM: "unknown" as never }),
    "background-color: var(--task-color-grey-bg); color: var(--task-color-grey-text);",
  );
});
