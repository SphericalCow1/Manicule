import assert from "node:assert/strict";
import test from "node:test";

import {
  applyInlineMarkdownFormat,
  canApplyInlineMarkdownFormat,
} from "../src/lib/editorTextFormatting.js";

test("wraps and unwraps selected inline markdown", () => {
  assert.equal(applyInlineMarkdownFormat("Important", "bold"), "**Important**");
  assert.equal(applyInlineMarkdownFormat("**Important**", "bold"), "Important");
  assert.equal(applyInlineMarkdownFormat("Note", "italic"), "*Note*");
  assert.equal(applyInlineMarkdownFormat("*Note*", "italic"), "Note");
  assert.equal(applyInlineMarkdownFormat("Old", "strikethrough"), "~~Old~~");
  assert.equal(applyInlineMarkdownFormat("`value`", "inline-code"), "value");
});

test("formats each selected non-empty line independently", () => {
  assert.equal(
    applyInlineMarkdownFormat("First\n\nSecond", "bold"),
    "**First**\n\n**Second**",
  );
  assert.equal(
    applyInlineMarkdownFormat("*First*\n\n*Second*", "italic"),
    "First\n\nSecond",
  );
});

test("allows inline code only for a single line selection", () => {
  assert.equal(canApplyInlineMarkdownFormat("one line", "inline-code"), true);
  assert.equal(canApplyInlineMarkdownFormat("first\nsecond", "inline-code"), false);
  assert.equal(applyInlineMarkdownFormat("first\nsecond", "inline-code"), null);
});
