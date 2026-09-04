import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import MarkdownIt from "markdown-it";

test("renders continuation lines as visible breaks in the right pane", () => {
  const markdownView = readFileSync(
    join(process.cwd(), "src/lib/components/MarkdownView.svelte"),
    "utf8",
  );

  assert.match(markdownView, /breaks: true/);
  assert.match(
    new MarkdownIt({ breaks: true }).render("- First line\n  Continuation"),
    /First line<br>\nContinuation/,
  );
});
