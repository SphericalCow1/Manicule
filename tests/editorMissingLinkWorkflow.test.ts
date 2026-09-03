import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const editor = readFileSync(join(root, "src/lib/components/CodeMirrorEditor.svelte"), "utf8");
const editorPane = readFileSync(join(root, "src/lib/components/EditorPane.svelte"), "utf8");

test("offers page creation for unresolved links in the editor context menu", () => {
  assert.match(editor, /contextLink\.resolvedPath && !contextLink\.resolvedExists/);
  assert.match(editor, /<span class="menu-mnemonic">C<\/span>reate page/);
  assert.match(editor, /onMissingWikiLink\(path\)/);
});

test("routes editor missing links into the shared create-and-open workflow", () => {
  assert.match(editorPane, /onMissingWikiLink=\{requestMissingPage\}/);
  assert.match(editorPane, /linkOperations\.createAndOpen\(missingLinkPath, openTarget/);
});
