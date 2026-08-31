import assert from "node:assert/strict";
import test from "node:test";

import { createNavigationHistory } from "../src/lib/stores/navigationHistory.js";

test("tracks back and forward navigation with derived availability", async () => {
  const history = createNavigationHistory();
  let currentPath = "A.md";

  history.record(currentPath, "B.md");
  currentPath = "B.md";
  history.record(currentPath, "C.md");
  currentPath = "C.md";

  assert.deepEqual(history.availability(), { canGoBack: true, canGoForward: false });

  assert.equal(
    await history.goBack(currentPath, async (targetPath) => {
      currentPath = targetPath;
      return true;
    }),
    true,
  );
  assert.equal(currentPath, "B.md");
  assert.deepEqual(history.availability(), { canGoBack: true, canGoForward: true });

  assert.equal(
    await history.goForward(currentPath, async (targetPath) => {
      currentPath = targetPath;
      return true;
    }),
    true,
  );
  assert.equal(currentPath, "C.md");
  assert.deepEqual(history.availability(), { canGoBack: true, canGoForward: false });
});

test("keeps history unchanged when navigation fails", async () => {
  const history = createNavigationHistory();
  history.record("A.md", "B.md");

  assert.equal(await history.goBack("B.md", async () => false), false);
  assert.deepEqual(history.availability(), { canGoBack: true, canGoForward: false });

  assert.equal(await history.goBack("B.md", async () => true), true);
  assert.deepEqual(history.availability(), { canGoBack: false, canGoForward: true });
});

test("new navigation clears forward history without recording duplicates", async () => {
  const history = createNavigationHistory();
  history.record(null, "A.md");
  history.record("A.md", "A.md");
  history.record("A.md", "B.md");
  await history.goBack("B.md", async () => true);

  assert.deepEqual(history.availability(), { canGoBack: false, canGoForward: true });

  history.record("A.md", "C.md");
  assert.deepEqual(history.availability(), { canGoBack: true, canGoForward: false });

  history.clear();
  assert.deepEqual(history.availability(), { canGoBack: false, canGoForward: false });
});
