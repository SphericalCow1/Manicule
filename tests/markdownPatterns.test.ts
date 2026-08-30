import assert from "node:assert/strict";
import test from "node:test";

import {
  listItemTextFrom,
  parseCheckboxListItem,
  parseListItemPrefix,
} from "../src/lib/markdownPatterns.js";

test("parses unordered ordered and indented list prefixes", () => {
  assert.deepEqual(parseListItemPrefix("\t12) Item"), {
    indentation: "\t",
    marker: "12)",
    markerFrom: 1,
    markerTo: 4,
    listContentFrom: 5,
    checkbox: null,
  });
  assert.equal(parseListItemPrefix("Plain text"), null);
});

test("parses checkbox markers once for all markdown consumers", () => {
  const parsed = parseCheckboxListItem("  - [X]  Finished");

  if (!parsed) {
    throw new Error("expected a parsed checkbox list item");
  }
  assert.equal(parsed.checkbox.from, 4);
  assert.equal(parsed.checkbox.to, 7);
  assert.equal(parsed.checkbox.checked, true);
  assert.equal(parsed.checkbox.trailingWhitespace, "  ");
  assert.equal(listItemTextFrom(parsed.listItem), 9);
});

test("keeps a checkbox without a separator as ordinary list content", () => {
  const parsed = parseCheckboxListItem("- [ ]No separator");

  if (!parsed) {
    throw new Error("expected a parsed checkbox list item");
  }
  assert.equal(parsed.checkbox.checked, false);
  assert.equal(listItemTextFrom(parsed.listItem), parsed.listItem.listContentFrom);
});
