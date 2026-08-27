import assert from "node:assert/strict";
import test from "node:test";
import {
  blockRangeForLines,
  emptyListBlockRange,
  emptyListLineAfterEnter,
  indentLineText,
  insertedListBlockPrefix,
  listBlockPrefix,
  listContinuationPrefix,
  moveBlockLines,
  movableBlockRanges,
  nextTaskLineText,
  outdentLineText,
} from "../src/lib/editorBlockCommands.js";

test("builds continuation prefixes for unordered list blocks", () => {
  assert.equal(listContinuationPrefix("- Parent"), "- ");
  assert.equal(listContinuationPrefix("  - Child"), "  - ");
  assert.equal(listContinuationPrefix("    * Detail"), "    * ");
  assert.equal(listContinuationPrefix("      - Deep detail"), "      - ");
});

test("builds continuation prefixes for checkbox list blocks", () => {
  assert.equal(listContinuationPrefix("* [ ] Open task"), "* [ ] ");
  assert.equal(listContinuationPrefix("- [ ] Open task"), "- [ ] ");
  assert.equal(listContinuationPrefix("  - [x] Done task"), "  - [x] ");
  assert.equal(listContinuationPrefix("    * [X] Done task"), "    * [X] ");
});

test("increments ordered list markers", () => {
  assert.equal(listContinuationPrefix("1. First"), "2. ");
  assert.equal(listContinuationPrefix("  9) Ninth"), "  10) ");
});

test("builds same-level prefixes for inserting before a list block", () => {
  assert.equal(listBlockPrefix("- Parent"), "- ");
  assert.equal(listBlockPrefix("  * Child"), "  * ");
  assert.equal(listBlockPrefix("3. Third"), "3. ");
  assert.equal(listBlockPrefix("- [ ] Task"), "- [ ] ");
  assert.equal(listBlockPrefix("Plain paragraph"), null);
});

test("continues at child indentation when inserting before existing child blocks", () => {
  assert.equal(insertedListBlockPrefix(["- Parent", "  - Existing child"], 1), "  - ");
  assert.equal(insertedListBlockPrefix(["- Parent", "  1. Existing child"], 1), "  2. ");
  assert.equal(insertedListBlockPrefix(["  - Parent", "    - Existing child"], 1), "    - ");
});

test("continues at current indentation when no following child block exists", () => {
  assert.equal(insertedListBlockPrefix(["- Parent", "- Sibling"], 1), "- ");
  assert.equal(insertedListBlockPrefix(["- Parent"], 1), "- ");
  assert.equal(insertedListBlockPrefix(["Plain paragraph", "  - Existing child"], 1), null);
});

test("does not create continuation prefixes for plain text", () => {
  assert.equal(listContinuationPrefix("Plain paragraph"), null);
  assert.equal(listContinuationPrefix("-"), null);
});

test("indents and outdents line text predictably", () => {
  assert.equal(indentLineText("- Task"), "  - Task");
  assert.equal(outdentLineText("  - Task"), "- Task");
  assert.equal(outdentLineText(" - Task"), "- Task");
  assert.equal(outdentLineText("\t- Task"), "- Task");
  assert.equal(outdentLineText("- Task"), "- Task");
});

test("detects empty list blocks", () => {
  assert.equal(emptyListBlockRange("- "), true);
  assert.equal(emptyListBlockRange("  1. "), true);
  assert.equal(emptyListBlockRange("- [ ] "), true);
  assert.equal(emptyListBlockRange("  * [x] "), true);
  assert.equal(emptyListBlockRange("- Task"), false);
  assert.equal(emptyListBlockRange("- [ ] Task"), false);
  assert.equal(emptyListBlockRange("Plain"), false);
});

test("reduces or exits empty list blocks on enter", () => {
  assert.equal(emptyListLineAfterEnter("    - "), "  - ");
  assert.equal(emptyListLineAfterEnter("  - "), "- ");
  assert.equal(emptyListLineAfterEnter("- "), "");
  assert.equal(emptyListLineAfterEnter("    - [ ] "), "  - [ ] ");
  assert.equal(emptyListLineAfterEnter("  * [x] "), "* [x] ");
  assert.equal(emptyListLineAfterEnter("- [ ] "), "");
  assert.equal(emptyListLineAfterEnter("- Task"), null);
});

test("toggles task status for list blocks", () => {
  assert.equal(nextTaskLineText("- TODO Write notes"), "- INPROGRESS Write notes");
  assert.equal(nextTaskLineText("- INPROGRESS Write notes"), "- WAITING Write notes");
  assert.equal(nextTaskLineText("- WAITING Write notes"), "- DONE Write notes");
  assert.equal(nextTaskLineText("- DONE Write notes"), "- TODO Write notes");
  assert.equal(nextTaskLineText("- Write notes"), "- TODO Write notes");
  assert.equal(nextTaskLineText("- WAITING Write notes", ["TODO", "WAITING", "DONE"]), "- DONE Write notes");
  assert.equal(nextTaskLineText("- Write notes", ["NEXT", "DONE"]), "- NEXT Write notes");
  assert.equal(nextTaskLineText("Plain text"), null);
});

test("finds block ranges including child blocks", () => {
  const lines = [
    "- Parent",
    "  - Child",
    "    - Detail",
    "- Sibling",
    "  continuation",
    "- After",
  ];

  assert.deepEqual(blockRangeForLines(lines, 1), {
    startLine: 1,
    endLine: 3,
    indent: 0,
    isList: true,
  });
  assert.deepEqual(blockRangeForLines(lines, 4), {
    startLine: 4,
    endLine: 5,
    indent: 0,
    isList: true,
  });
});

test("finds sibling ranges for moving blocks", () => {
  const lines = [
    "- First",
    "  - First child",
    "- Second",
    "  - Second child",
    "- Third",
  ];

  assert.deepEqual(movableBlockRanges(lines, 3, "up"), {
    current: { startLine: 3, endLine: 4, indent: 0, isList: true },
    target: { startLine: 1, endLine: 2, indent: 0, isList: true },
  });
  assert.deepEqual(movableBlockRanges(lines, 3, "down"), {
    current: { startLine: 3, endLine: 4, indent: 0, isList: true },
    target: { startLine: 5, endLine: 5, indent: 0, isList: true },
  });
  assert.equal(movableBlockRanges(lines, 1, "up"), null);
  assert.equal(movableBlockRanges(lines, 5, "down"), null);
});

test("moves list blocks with their child blocks", () => {
  const lines = [
    "- First",
    "  - First child",
    "- Second",
    "  - Second child",
    "- Third",
  ];

  assert.deepEqual(moveBlockLines(lines, 3, "up")?.lines, [
    "- Second",
    "  - Second child",
    "- First",
    "  - First child",
    "- Third",
  ]);
  assert.deepEqual(moveBlockLines(lines, 3, "down")?.lines, [
    "- First",
    "  - First child",
    "- Third",
    "- Second",
    "  - Second child",
  ]);
  assert.deepEqual(moveBlockLines(lines, 5, "up")?.lines, [
    "- First",
    "  - First child",
    "- Third",
    "- Second",
    "  - Second child",
  ]);
});
