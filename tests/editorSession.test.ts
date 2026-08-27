import assert from "node:assert/strict";
import test from "node:test";

import { get } from "svelte/store";
import { createEditorSessionStore } from "../src/lib/stores/createEditorSessionStore.js";
import type { PageContent, SavePageResult } from "../src/lib/types.js";

function page(content: string, contentHash: string): PageContent {
  return {
    path: "Inbox.md",
    content,
    modifiedAt: "m0",
    contentHash,
  };
}

function savingStore(
  savePage: (
    path: string,
    content: string,
    modifiedAt: string,
    expectedContentHash: string,
  ) => Promise<SavePageResult>,
) {
  let diskContent = "original";
  let diskHash = "h0";
  let diskModifiedAt = "m0";

  return createEditorSessionStore({
    openPage: async () => ({
      path: "Inbox.md",
      content: diskContent,
      modifiedAt: diskModifiedAt,
      contentHash: diskHash,
    }),
    savePage: async (path, content, modifiedAt, expectedContentHash) => {
      const result = await savePage(path, content, modifiedAt, expectedContentHash);

      if (result.status === "saved") {
        diskContent = content;
        diskHash = result.contentHash;
        diskModifiedAt = result.modifiedAt;
      }

      return result;
    },
    refreshRightPane: async () => {},
    autoSaveDelayMs: 10,
  });
}

test("saves the same editor page repeatedly with updated content hashes", async () => {
  const saveCalls: Array<{
    content: string;
    expectedContentHash: string;
  }> = [];
  const store = savingStore(async (_path, content, _modifiedAt, expectedContentHash) => {
    saveCalls.push({ content, expectedContentHash });
    return {
      status: "saved",
      path: "Inbox.md",
      modifiedAt: `m${saveCalls.length}`,
      contentHash: `h${saveCalls.length}`,
    };
  });

  await store.open("Inbox.md");
  store.setContent("first");
  await store.save();
  store.setContent("second");
  await store.save();

  assert.deepEqual(saveCalls, [
    { content: "first", expectedContentHash: "h0" },
    { content: "second", expectedContentHash: "h1" },
  ]);
  assert.equal(get(store).dirty, false);
  assert.equal(get(store).contentHash, "h2");
});

test("saves repeated editor content overrides without requiring a reload", async () => {
  const saveCalls: Array<{
    content: string;
    expectedContentHash: string;
  }> = [];
  const store = savingStore(async (_path, content, _modifiedAt, expectedContentHash) => {
    saveCalls.push({ content, expectedContentHash });
    return {
      status: "saved",
      path: "Inbox.md",
      modifiedAt: `m${saveCalls.length}`,
      contentHash: `h${saveCalls.length}`,
    };
  });

  await store.open("Inbox.md");
  await store.save("first");
  await store.save("second");

  assert.deepEqual(saveCalls, [
    { content: "first", expectedContentHash: "h0" },
    { content: "second", expectedContentHash: "h1" },
  ]);
  assert.equal(get(store).content, "second");
  assert.equal(get(store).dirty, false);
  assert.equal(get(store).contentHash, "h2");
});

test("saves after the editor has already reported the same content as changed", async () => {
  const saveCalls: Array<{
    content: string;
    expectedContentHash: string;
  }> = [];
  const store = savingStore(async (_path, content, _modifiedAt, expectedContentHash) => {
    saveCalls.push({ content, expectedContentHash });
    return {
      status: "saved",
      path: "Inbox.md",
      modifiedAt: `m${saveCalls.length}`,
      contentHash: `h${saveCalls.length}`,
    };
  });

  await store.open("Inbox.md");
  store.setContent("first");
  await store.save("first");
  store.setContent("second");
  await store.save("second");

  assert.deepEqual(saveCalls, [
    { content: "first", expectedContentHash: "h0" },
    { content: "second", expectedContentHash: "h1" },
  ]);
  assert.equal(get(store).content, "second");
  assert.equal(get(store).dirty, false);
  assert.equal(get(store).contentHash, "h2");
});

test("queues a follow-up autosave when content changes during an in-flight save", async () => {
  let resolveFirstSave: (result: SavePageResult) => void = () => {};
  const saveCalls: string[] = [];
  const store = savingStore(async (_path, content) => {
    saveCalls.push(content);

    if (saveCalls.length === 1) {
      return new Promise<SavePageResult>((resolve) => {
        resolveFirstSave = resolve;
      });
    }

    return {
      status: "saved",
      path: "Inbox.md",
      modifiedAt: "m2",
      contentHash: "h2",
    };
  });

  await store.open("Inbox.md");
  store.setContent("first");
  const firstSave = store.save();
  store.setContent("second");

  resolveFirstSave({
    status: "saved",
    path: "Inbox.md",
    modifiedAt: "m1",
    contentHash: "h1",
  });
  await firstSave;
  await new Promise((resolve) => setTimeout(resolve, 20));

  assert.deepEqual(saveCalls, ["first", "second"]);
  assert.equal(get(store).dirty, false);
  assert.equal(get(store).contentHash, "h2");
});

test("records a requested source line when opening from a backlink", async () => {
  const store = createEditorSessionStore({
    openPage: async () => page("source", "h0"),
    savePage: async () => ({
      status: "saved",
      path: "Inbox.md",
      modifiedAt: "m1",
      contentHash: "h1",
    }),
    refreshRightPane: async () => {},
    autoSaveDelayMs: 10,
  });

  await store.open("Inbox.md", { line: 12 });
  const state = get(store);

  assert.equal(state.revealLine, 12);
  assert.equal(state.revealToken, 1);
});

test("saves dirty content before opening another editor page", async () => {
  const openedPaths: string[] = [];
  const savedContents: string[] = [];
  const store = createEditorSessionStore({
    openPage: async (path) => {
      openedPaths.push(path);
      return {
        path,
        content: `${path} content`,
        modifiedAt: "m0",
        contentHash: "h0",
      };
    },
    savePage: async (_path, content) => {
      savedContents.push(content);
      return {
        status: "saved",
        path: "Inbox.md",
        modifiedAt: "m1",
        contentHash: "h1",
      };
    },
    refreshRightPane: async () => {},
    autoSaveDelayMs: 10,
  });

  await store.open("Inbox.md");
  store.setContent("unsaved edit");
  await store.open("Projects.md");

  assert.deepEqual(savedContents, ["unsaved edit"]);
  assert.deepEqual(openedPaths, ["Inbox.md", "Inbox.md", "Projects.md"]);
  assert.equal(get(store).path, "Projects.md");
  assert.equal(get(store).dirty, false);
});

test("reveals a line in the current editor page without reloading dirty content", async () => {
  let openCalls = 0;
  const store = createEditorSessionStore({
    openPage: async () => {
      openCalls += 1;
      return page("source", "h0");
    },
    savePage: async () => ({
      status: "saved",
      path: "Inbox.md",
      modifiedAt: "m1",
      contentHash: "h1",
    }),
    refreshRightPane: async () => {},
    autoSaveDelayMs: 10,
  });

  await store.open("Inbox.md");
  store.setContent("local edit");
  await store.open("Inbox.md", { line: 7 });
  const state = get(store);

  assert.equal(openCalls, 1);
  assert.equal(state.content, "local edit");
  assert.equal(state.dirty, true);
  assert.equal(state.revealLine, 7);
  assert.equal(state.revealToken, 1);
});

test("tracks editor back and forward history", async () => {
  const store = createEditorSessionStore({
    openPage: async (path) => ({
      path,
      content: `${path} content`,
      modifiedAt: "m0",
      contentHash: path,
    }),
    savePage: async (_path, _content) => ({
      status: "saved",
      path: "unused.md",
      modifiedAt: "m1",
      contentHash: "h1",
    }),
    refreshRightPane: async () => {},
    autoSaveDelayMs: 10,
  });

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

test("does not duplicate current-page reveals in editor history", async () => {
  const store = createEditorSessionStore({
    openPage: async (path) => ({
      path,
      content: `${path} content`,
      modifiedAt: "m0",
      contentHash: path,
    }),
    savePage: async (_path, _content) => ({
      status: "saved",
      path: "unused.md",
      modifiedAt: "m1",
      contentHash: "h1",
    }),
    refreshRightPane: async () => {},
    autoSaveDelayMs: 10,
  });

  await store.open("A.md");
  await store.open("B.md");
  await store.open("B.md", { line: 12 });
  await store.goBack();

  assert.equal(get(store).path, "A.md");
  assert.equal(get(store).canGoBack, false);
  assert.equal(get(store).canGoForward, true);
});

test("clears editor forward history after new navigation", async () => {
  const store = createEditorSessionStore({
    openPage: async (path) => ({
      path,
      content: `${path} content`,
      modifiedAt: "m0",
      contentHash: path,
    }),
    savePage: async (_path, _content) => ({
      status: "saved",
      path: "unused.md",
      modifiedAt: "m1",
      contentHash: "h1",
    }),
    refreshRightPane: async () => {},
    autoSaveDelayMs: 10,
  });

  await store.open("A.md");
  await store.open("B.md");
  await store.open("C.md");
  await store.goBack();
  await store.open("D.md");

  assert.equal(get(store).path, "D.md");
  assert.equal(get(store).canGoBack, true);
  assert.equal(get(store).canGoForward, false);
});

test("updates task status lines in editor content", async () => {
  const store = createEditorSessionStore({
    openPage: async () => page("- TODO First\r\n  - WAITING Second\r\n", "h0"),
    savePage: async () => ({
      status: "saved",
      path: "Inbox.md",
      modifiedAt: "m1",
      contentHash: "h1",
    }),
    refreshRightPane: async () => {},
    autoSaveDelayMs: 10,
  });

  await store.open("Inbox.md");
  const changed = store.setTaskStatusLine(2, "WAITING", "DONE", [
    "TODO",
    "WAITING",
    "DONE",
  ]);

  assert.equal(changed, true);
  assert.equal(get(store).content, "- TODO First\r\n  - DONE Second\r\n");
  assert.equal(get(store).dirty, true);
});

test("updates task priority lines in editor content", async () => {
  const store = createEditorSessionStore({
    openPage: async () => page("- TODO First\r\n- DONE [#A] Second\r\n", "h0"),
    savePage: async () => ({
      status: "saved",
      path: "Inbox.md",
      modifiedAt: "m1",
      contentHash: "h1",
    }),
    refreshRightPane: async () => {},
    autoSaveDelayMs: 10,
  });

  await store.open("Inbox.md");
  const added = store.setTaskPriorityLine(1, "B", ["TODO", "DONE"]);
  const removed = store.setTaskPriorityLine(2, null, ["TODO", "DONE"]);

  assert.equal(added, true);
  assert.equal(removed, true);
  assert.equal(get(store).content, "- TODO [#B] First\r\n- DONE Second\r\n");
  assert.equal(get(store).dirty, true);
});
