import assert from "node:assert/strict";
import test from "node:test";

import { nextEnabledMenuIndex } from "../src/lib/contextMenuKeyboard.js";

test("root menu navigation wraps and skips disabled entries", () => {
  const enabled = [true, false, true, true];

  assert.equal(nextEnabledMenuIndex(enabled, 0, "ArrowDown"), 2);
  assert.equal(nextEnabledMenuIndex(enabled, 3, "ArrowDown"), 0);
  assert.equal(nextEnabledMenuIndex(enabled, 0, "ArrowUp"), 3);
});

test("Home and End select the first and last enabled menu entry", () => {
  const enabled = [false, true, false, true, false];

  assert.equal(nextEnabledMenuIndex(enabled, 1, "Home"), 1);
  assert.equal(nextEnabledMenuIndex(enabled, 1, "End"), 3);
});

for (const submenu of ["Status", "Priority", "Color", "Sort"]) {
  test(`${submenu} submenu navigation handles disabled current values`, () => {
    const enabled = submenu === "Sort" ? [true, true] : [false, true, true, true];

    assert.equal(nextEnabledMenuIndex(enabled, -1, "ArrowDown"), enabled.indexOf(true));
    assert.equal(
      nextEnabledMenuIndex(enabled, enabled.indexOf(true), "ArrowUp"),
      enabled.lastIndexOf(true),
    );
  });
}

test("navigation reports no target for an empty or fully disabled menu", () => {
  assert.equal(nextEnabledMenuIndex([], -1, "ArrowDown"), -1);
  assert.equal(nextEnabledMenuIndex([false, false], 0, "End"), -1);
});
