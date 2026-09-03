import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("sizes filename search results by their content", () => {
  const navigationTree = readFileSync(
    join(root, "src/lib/components/NavigationTree.svelte"),
    "utf8",
  );
  const fileTree = readFileSync(join(root, "src/lib/components/FileTree.svelte"), "utf8");
  const styles = readFileSync(join(root, "src/styles.css"), "utf8");

  assert.match(navigationTree, /class:search-active=\{searchActive\}/);
  assert.match(navigationTree, /Results by Filename/);
  assert.match(fileTree, /Results by Content/);
  assert.match(styles, /\.page-list\.search-active\s*\{\s*flex: 0 1 auto;/);
});
