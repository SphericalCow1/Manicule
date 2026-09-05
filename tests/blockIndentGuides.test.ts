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
    /\.right-pane \.markdown-view li > ul::before,[\s\S]*?\.right-pane \.markdown-view li > ol::before\s*\{[^}]*top: 2em;[^}]*left: var\(--markdown-list-marker-axis\);[^}]*border-left: 1px solid var\(--block-indent-guide\);/,
  );
});

test("uses one scalable axis for right-pane list markers and guides", () => {
  assert.match(
    styles,
    /\.right-pane \.markdown-view\s*\{[^}]*--markdown-list-indent: 2em;[^}]*--markdown-list-marker-axis: -1em;/s,
  );
  assert.match(
    styles,
    /\.right-pane \.markdown-view ul,[\s\S]*?\.right-pane \.markdown-view ol\s*\{[^}]*margin-left: 0;[^}]*padding-left: var\(--markdown-list-indent\);/,
  );
  assert.match(
    styles,
    /\.right-pane \.markdown-view ul > li\[data-list-marker\]::before,[\s\S]*?\.right-pane \.markdown-view ol > li\[data-list-marker\]::before\s*\{[^}]*left: var\(--markdown-list-marker-axis\);/,
  );
});

test("uses a CSS marker for bullets and the rendered source marker for ordered lists", () => {
  assert.match(
    styles,
    /\.right-pane \.markdown-view ul > li\[data-list-marker\]::before\s*\{[^}]*border-radius: 50%;[^}]*background: currentColor;/s,
  );
  assert.match(
    styles,
    /\.right-pane \.markdown-view ol > li\[data-list-marker\]::before\s*\{[^}]*content: attr\(data-list-marker\);[^}]*font-variant-numeric: tabular-nums;/s,
  );
});

test("places task checkboxes on the same marker axis without an extra bullet", () => {
  assert.match(
    styles,
    /\.right-pane \.markdown-view li\.task-list-item::before\s*\{[^}]*display: none;/s,
  );
  assert.match(
    styles,
    /\.right-pane \.markdown-view li\.task-list-item > \.task-list-checkbox:first-child\s*\{[^}]*left: var\(--markdown-list-marker-axis\);/s,
  );
});
