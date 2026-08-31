import assert from "node:assert/strict";
import test from "node:test";

import {
  createLinkOperations,
  markdownPathForLinkTarget,
  type LinkOperationDependencies,
} from "../src/lib/stores/linkOperations.js";
import type { PageSummary } from "../src/lib/types.js";

function createHarness(createPageResult: PageSummary | null = null) {
  const events: string[] = [];
  const dependencies: LinkOperationDependencies = {
    showEditor: () => events.push("show-editor"),
    openEditor: async (path, options) => {
      events.push(`open-editor:${path}:${JSON.stringify(options)}`);
    },
    openRightPane: async (path, options) => {
      events.push(`open-right:${path}:${JSON.stringify(options)}`);
    },
    createPage: async (path) => {
      events.push(`create:${path}`);
      return createPageResult;
    },
  };

  return { events, operations: createLinkOperations(dependencies) };
}

test("normalizes link targets to markdown paths once", () => {
  assert.equal(markdownPathForLinkTarget("projects/forecast"), "projects/forecast.md");
  assert.equal(markdownPathForLinkTarget("projects/forecast.md"), "projects/forecast.md");
});

test("opens links in the explicit pane with navigation options", async () => {
  const editor = createHarness();
  await editor.operations.open("projects/forecast", "editor", {
    line: 12,
    recordHistory: false,
  });
  assert.deepEqual(editor.events, [
    "show-editor",
    'open-editor:projects/forecast.md:{"line":12,"recordHistory":false}',
  ]);

  const right = createHarness();
  await right.operations.open("projects/forecast.md", "right", { line: 8 });
  assert.deepEqual(right.events, [
    'open-right:projects/forecast.md:{"line":8}',
  ]);
});

test("creates, refreshes the source, and opens the canonical page path in order", async () => {
  const page: PageSummary = {
    exists: true,
    key: "projects/forecast",
    path: "Projects/Forecast.md",
    title: "Forecast",
  };
  const harness = createHarness(page);

  const created = await harness.operations.createAndOpen("projects/forecast", "right", {
    afterCreate: () => {
      harness.events.push("refresh-source");
    },
  });

  assert.equal(created, page);
  assert.deepEqual(harness.events, [
    "create:projects/forecast.md",
    "refresh-source",
    "open-right:Projects/Forecast.md:{}",
  ]);
});

test("does not refresh or navigate when page creation is handled as unsuccessful", async () => {
  const harness = createHarness(null);

  const created = await harness.operations.createAndOpen("missing", "editor", {
    afterCreate: () => {
      harness.events.push("refresh-source");
    },
  });

  assert.equal(created, null);
  assert.deepEqual(harness.events, ["create:missing.md"]);
});
