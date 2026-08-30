import assert from "node:assert/strict";
import test from "node:test";
import { toErrorMessage } from "../src/lib/errors.js";

test("returns messages from current and future error shapes", () => {
  assert.equal(toErrorMessage(new Error("JavaScript failure")), "JavaScript failure");
  assert.equal(toErrorMessage("Tauri failure"), "Tauri failure");
  assert.equal(toErrorMessage({ code: "page-not-found", message: "Missing page" }), "Missing page");
});

test("falls back safely for unknown values", () => {
  assert.equal(toErrorMessage(null), "null");
  assert.equal(toErrorMessage(42), "42");
  assert.equal(toErrorMessage(Object.create(null)), "Unknown error");
});
