import assert from "node:assert/strict";
import MarkdownIt from "markdown-it";
import test from "node:test";

import {
  renderedListMarker,
  SOURCE_LINE_RENDER_TOKEN_RULES,
  sourceLineForLocalLine,
  sourceLineSelectorForLine,
} from "../src/lib/markdownSourceLines.js";

test("maps local markdown lines to source lines", () => {
  assert.equal(sourceLineForLocalLine(1), 1);
  assert.equal(sourceLineForLocalLine(3), 3);
  assert.equal(sourceLineForLocalLine(1, [12, 13, 15]), 12);
  assert.equal(sourceLineForLocalLine(3, [12, 13, 15]), 15);
  assert.equal(sourceLineForLocalLine(4, [12, 13, 15]), 4);
});

test("builds stable rendered markers for unordered and ordered list items", () => {
  assert.equal(renderedListMarker({ type: "list_item_open", info: "", markup: "-" }), "-");
  assert.equal(renderedListMarker({ type: "list_item_open", info: "3", markup: "." }), "3.");
  assert.equal(renderedListMarker({ type: "list_item_open", info: "4", markup: ")" }), "4)");
  assert.equal(renderedListMarker({ type: "paragraph_open", info: "", markup: "" }), null);
});

test("reads rendered marker values from Markdown-it list tokens", () => {
  const markdown = new MarkdownIt();
  const markers = markdown
    .parse("- Parent\n  + Child\n3. Ordered\n4) Alternate", {})
    .map(renderedListMarker)
    .filter((marker) => marker !== null);

  assert.deepEqual(markers, ["-", "+", "3.", "4)"]);
});

test("marks concrete markdown blocks rather than list containers", () => {
  assert.ok(SOURCE_LINE_RENDER_TOKEN_RULES.includes("list_item_open"));
  assert.ok(SOURCE_LINE_RENDER_TOKEN_RULES.includes("paragraph_open"));
  assert.ok(SOURCE_LINE_RENDER_TOKEN_RULES.includes("heading_open"));
  assert.equal(SOURCE_LINE_RENDER_TOKEN_RULES.includes("ordered_list_open"), false);
  assert.equal(SOURCE_LINE_RENDER_TOKEN_RULES.includes("bullet_list_open"), false);
  assert.equal(SOURCE_LINE_RENDER_TOKEN_RULES.includes("blockquote_open"), false);
});

test("builds highlight selector for source, task, and checkbox line markers", () => {
  assert.equal(
    sourceLineSelectorForLine(7),
    '[data-source-line="7"], [data-task-line="7"], [data-line="7"]',
  );
});
