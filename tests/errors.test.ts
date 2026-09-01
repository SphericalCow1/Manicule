import assert from "node:assert/strict";
import test from "node:test";
import { toErrorDetail, toErrorMessage, toErrorPresentation } from "../src/lib/errors.js";

test("returns messages from current and future error shapes", () => {
  assert.equal(toErrorMessage(new Error("JavaScript failure")), "JavaScript failure");
  assert.equal(toErrorMessage("Tauri failure"), "Tauri failure");
  assert.equal(toErrorMessage({ code: "page-not-found", message: "Missing page" }), "Missing page");
});

test("preserves stable error codes and technical details", () => {
  const presentation = toErrorPresentation({
    code: "io",
    message: "The page could not be written.",
    detail: "permission denied for notes/Inbox.md",
  });

  assert.deepEqual(presentation, {
    code: "io",
    message: "The page could not be written.",
    detail: "permission denied for notes/Inbox.md",
  });
  assert.equal(
    toErrorDetail({ code: "io", message: "Could not write", detail: "disk full" }),
    "disk full",
  );
});

test("uses actionable fallback text for known codes without a message", () => {
  assert.equal(
    toErrorMessage({ code: "folder_not_empty", message: "" }),
    "The folder is not empty. Move or delete its contents first.",
  );
});

test("falls back safely for unknown values", () => {
  assert.equal(toErrorMessage(null), "null");
  assert.equal(toErrorMessage(42), "42");
  assert.equal(toErrorMessage(Object.create(null)), "Unknown error");
});
