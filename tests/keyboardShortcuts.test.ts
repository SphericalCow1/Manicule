import assert from "node:assert/strict";
import test from "node:test";
import { collapseLevelFromShortcut } from "../src/lib/keyboardShortcuts.js";

function shortcut(overrides: Partial<KeyboardEvent> = {}) {
  return {
    altKey: false,
    code: "",
    ctrlKey: false,
    isComposing: false,
    metaKey: false,
    shiftKey: false,
    ...overrides,
  } as KeyboardEvent;
}

test("recognizes layout-independent collapse level shortcuts", () => {
  assert.equal(collapseLevelFromShortcut(shortcut({ code: "Digit1", ctrlKey: true })), 1);
  assert.equal(collapseLevelFromShortcut(shortcut({ code: "Digit4", metaKey: true })), 4);
  assert.equal(
    collapseLevelFromShortcut(shortcut({ code: "Digit1", ctrlKey: true, key: "!" })),
    1,
  );
});

test("ignores shifted, modified, and out-of-range digit shortcuts", () => {
  assert.equal(
    collapseLevelFromShortcut(shortcut({ code: "Digit1", ctrlKey: true, shiftKey: true })),
    null,
  );
  assert.equal(
    collapseLevelFromShortcut(shortcut({ altKey: true, code: "Digit2", ctrlKey: true })),
    null,
  );
  assert.equal(collapseLevelFromShortcut(shortcut({ code: "Digit5", ctrlKey: true })), null);
  assert.equal(collapseLevelFromShortcut(shortcut({ code: "Numpad1", ctrlKey: true })), null);
  assert.equal(collapseLevelFromShortcut(shortcut({ code: "Digit1" })), null);
});
