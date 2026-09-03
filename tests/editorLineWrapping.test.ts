import assert from "node:assert/strict";
import test from "node:test";
import {
  listContinuationIndent,
  listIndentGuideOffsets,
} from "../src/lib/editorLineWrapping.js";

test("detects hanging indent width for list wrapping", () => {
  assert.equal(listContinuationIndent("- Parent text"), 2);
  assert.equal(listContinuationIndent("  - Child text"), 4);
  assert.equal(listContinuationIndent("    * Detail text"), 6);
  assert.equal(listContinuationIndent("1. Ordered text"), 3);
  assert.equal(listContinuationIndent("  10) Ordered text"), 6);
});

test("includes checkbox markers in list wrapping indent", () => {
  assert.equal(listContinuationIndent("- [ ] Open task"), 6);
  assert.equal(listContinuationIndent("  - [x] Done task"), 8);
  assert.equal(listContinuationIndent("    * [X] Nested done task"), 10);
});

test("does not indent non-list or empty marker lines", () => {
  assert.equal(listContinuationIndent("Plain paragraph"), 0);
  assert.equal(listContinuationIndent("-"), 0);
  assert.equal(listContinuationIndent("- "), 0);
  assert.equal(listContinuationIndent("  - "), 0);
});

test("places one indentation guide for every nested list level", () => {
  assert.deepEqual(listIndentGuideOffsets("- Parent"), []);
  assert.deepEqual(listIndentGuideOffsets("  - Child"), [0.5]);
  assert.deepEqual(listIndentGuideOffsets("    * Grandchild"), [0.5, 2.5]);
  assert.deepEqual(listIndentGuideOffsets("      1. Detail"), [0.5, 2.5, 4.5]);
});

test("does not add indentation guides to ordinary text", () => {
  assert.deepEqual(listIndentGuideOffsets("    Continued text"), []);
  assert.deepEqual(listIndentGuideOffsets("Plain paragraph"), []);
});
