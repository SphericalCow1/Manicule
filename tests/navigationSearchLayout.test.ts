import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

test("shows one ranked result list while searching", () => {
  const navigationTree = readFileSync(
    join(root, "src/lib/components/NavigationTree.svelte"),
    "utf8",
  );
  const fileTree = readFileSync(join(root, "src/lib/components/FileTree.svelte"), "utf8");
  const styles = readFileSync(join(root, "src/styles.css"), "utf8");

  assert.equal(/Results by Filename/.test(navigationTree), false);
  assert.match(fileTree, /\{#if !searchQuery\.trim\(\)\}\s*<NavigationTree/);
  assert.match(fileTree, /<span>Ranked Results<\/span>/);
  assert.equal(/Results by Content/.test(fileTree), false);
  assert.match(styles, /\.content-search-results\s*\{[^}]*flex: 1;/s);
});
