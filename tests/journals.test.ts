import assert from "node:assert/strict";
import test from "node:test";

import { journalPath, journalPathForDateInput, journalPathForDay } from "../src/lib/journals.js";

const date = new Date(2026, 7, 9);

test("builds journal paths from local dates", () => {
  assert.equal(journalPath(date), "journal/2026-08-09.md");
});

test("builds adjacent journal paths", () => {
  assert.equal(journalPathForDay("yesterday", date), "journal/2026-08-08.md");
  assert.equal(journalPathForDay("today", date), "journal/2026-08-09.md");
  assert.equal(journalPathForDay("tomorrow", date), "journal/2026-08-10.md");
});

test("builds journal paths from date picker input", () => {
  assert.equal(journalPathForDateInput("2026-08-09"), "journal/2026-08-09.md");
  assert.equal(journalPathForDateInput("2026-02-30"), null);
  assert.equal(journalPathForDateInput("08/09/2026"), null);
});
