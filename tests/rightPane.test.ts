import assert from "node:assert/strict";
import test from "node:test";

import { get } from "svelte/store";
import { createRightPaneStore } from "../src/lib/stores/rightPane.js";
import type { PageView } from "../src/lib/types.js";

function pageView(path: string): PageView {
  const key = path.replace(/\.md$/, "").toLowerCase();
  return {
    page: { exists: true, key, path, title: key },
    content: `# ${key}`,
    backlinks: [],
    diagnostics: [],
  };
}

test("tracks right-pane back and forward history", async () => {
  const store = createRightPaneStore({ getPageView: async (path) => pageView(path) });

  await store.open("A.md");
  await store.open("B.md");
  await store.open("C.md");

  assert.equal(get(store).path, "C.md");
  assert.equal(get(store).canGoBack, true);
  assert.equal(get(store).canGoForward, false);

  await store.goBack();
  assert.equal(get(store).path, "B.md");
  assert.equal(get(store).canGoBack, true);
  assert.equal(get(store).canGoForward, true);

  await store.goForward();
  assert.equal(get(store).path, "C.md");
  assert.equal(get(store).canGoBack, true);
  assert.equal(get(store).canGoForward, false);
});

test("keeps the current page and history when right-pane back navigation fails", async () => {
  const failingPaths = new Set<string>();
  const store = createRightPaneStore({
    getPageView: async (path) => {
      if (failingPaths.has(path)) {
        throw new Error(`cannot open ${path}`);
      }
      return pageView(path);
    },
  });

  await store.open("A.md");
  await store.open("B.md");
  failingPaths.add("A.md");
  await store.goBack();

  assert.equal(get(store).path, "B.md");
  assert.equal(get(store).pageView?.page.path, "B.md");
  assert.equal(get(store).canGoBack, true);
  assert.equal(get(store).canGoForward, false);
  assert.equal(get(store).error, "cannot open A.md");

  failingPaths.clear();
  await store.goBack();
  assert.equal(get(store).path, "A.md");
  assert.equal(get(store).canGoBack, false);
  assert.equal(get(store).canGoForward, true);
});
