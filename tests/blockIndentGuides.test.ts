import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const styles = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");

test("draws editor indentation guides across the full visual line height", () => {
  assert.match(
    styles,
    /\.code-editor \.cm-list-indent-guides::before\s*\{[^}]*inset: 0;[^}]*background-size: 1px 100%;/s,
  );
});

test("draws indentation guides for nested lists in the right pane", () => {
  assert.match(
    styles,
    /\.right-pane \.markdown-view li > ul::before,[\s\S]*?\.right-pane \.markdown-view li > ol::before\s*\{[^}]*left: -1\.85em;[^}]*border-left: 1px solid var\(--block-indent-guide\);/,
  );
});
