import assert from "node:assert/strict";
import test from "node:test";

import { checkboxLines, toggleCheckboxLine } from "../src/lib/checkboxes.js";

test("lists checkbox source lines", () => {
  assert.deepEqual(checkboxLines("- [ ] Open\nPlain\n- [x] Done"), [
    { lineNumber: 1, checked: false },
    { lineNumber: 3, checked: true },
  ]);
});

test("toggles checkbox source lines while preserving line endings", () => {
  const first = toggleCheckboxLine("- [ ] Open\r\n- [x] Done\r\n", 1);
  assert.equal(first.changed, true);
  assert.equal(first.content, "- [x] Open\r\n- [x] Done\r\n");

  const second = toggleCheckboxLine(first.content, 2);
  assert.equal(second.changed, true);
  assert.equal(second.content, "- [x] Open\r\n- [ ] Done\r\n");
});

test("does not toggle non-checkbox lines", () => {
  assert.deepEqual(toggleCheckboxLine("- TODO Open", 1), {
    changed: false,
    content: "- TODO Open",
    checked: null,
  });
});
