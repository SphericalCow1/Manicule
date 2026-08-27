import assert from "node:assert/strict";
import test from "node:test";

import { renderTaskKeywords, taskPriorityChange } from "../src/lib/taskKeywords.js";

test("renders task keywords at the start of list blocks", () => {
  assert.equal(
    renderTaskKeywords("- TODO Prepare\n  - INPROGRESS Follow up\n+ DONE Closed"),
    "- **TODO** Prepare\n  - **INPROGRESS** Follow up\n+ **DONE** Closed",
  );
});

test("renders task keywords after checkbox markers", () => {
  assert.equal(renderTaskKeywords("- [ ] WAITING Input"), "- [ ] **WAITING** Input");
});

test("renders task keywords before attached priority cookies", () => {
  assert.equal(renderTaskKeywords("- TODO[#A] Prepare"), "- **TODO**[#A] Prepare");
});

test("does not render task keywords inside ordinary text", () => {
  assert.equal(renderTaskKeywords("- Discuss TODO handling"), "- Discuss TODO handling");
});

test("renders configured task keywords", () => {
  assert.equal(
    renderTaskKeywords("- BLOCKED Input", ["TODO", "BLOCKED", "DONE"]),
    "- **BLOCKED** Input",
  );
  assert.equal(renderTaskKeywords("- WAITING Input", ["TODO", "BLOCKED", "DONE"]), "- WAITING Input");
});

test("adds task priority cookies after task keywords", () => {
  assert.deepEqual(taskPriorityChange("- TODO Prepare", 0, "A"), {
    from: 6,
    to: 6,
    insert: " [#A]",
  });
});

test("replaces spaced and attached task priority cookies", () => {
  assert.deepEqual(taskPriorityChange("- TODO [#A] Prepare", 0, "B"), {
    from: 7,
    to: 11,
    insert: "[#B]",
  });
  assert.deepEqual(taskPriorityChange("- TODO[#A] Prepare", 0, "C"), {
    from: 6,
    to: 10,
    insert: "[#C]",
  });
});

test("removes task priority cookies without leaving duplicate spacing", () => {
  assert.deepEqual(taskPriorityChange("- TODO [#A] Prepare", 0, null), {
    from: 6,
    to: 11,
    insert: "",
  });
  assert.deepEqual(taskPriorityChange("- TODO[#A] Prepare", 0, null), {
    from: 6,
    to: 10,
    insert: "",
  });
});
