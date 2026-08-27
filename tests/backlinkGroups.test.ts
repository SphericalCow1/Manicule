import assert from "node:assert/strict";
import test from "node:test";

import { filterBacklinks, shortBacklinkContext } from "../src/lib/backlinkGroups.js";
import type { BacklinkView } from "../src/lib/types.js";

const backlinks: BacklinkView[] = [
  {
    sourcePath: "journal/2026-08-09.md",
    sourceTitle: "2026-08-09",
    sourceHeadings: ["Daily"],
    blockMarkdown: "- TODO Call [[Team]]\n  - Prepare notes",
    lineNumbers: [4, 5],
    lineStart: 4,
  },
  {
    sourcePath: "journal/2026-08-09.md",
    sourceTitle: "2026-08-09",
    sourceHeadings: ["Daily"],
    blockMarkdown: "- DONE Send [[Team]] update",
    lineNumbers: [9],
    lineStart: 9,
  },
  {
    sourcePath: "projects/alpha.md",
    sourceTitle: "alpha",
    sourceHeadings: ["Forecast"],
    blockMarkdown: "- Discuss [[Team]] forecast",
    lineNumbers: [2],
    lineStart: 2,
  },
];

test("filters backlinks while preserving order", () => {
  const filtered = filterBacklinks(backlinks);

  assert.equal(filtered.length, 3);
  assert.equal(filtered[0].sourcePath, "journal/2026-08-09.md");
  assert.equal(filtered[1].lineStart, 9);
  assert.equal(filtered[2].sourcePath, "projects/alpha.md");
});

test("filters backlinks by source, heading, and block content", () => {
  assert.deepEqual(
    filterBacklinks(backlinks, "forecast").map((backlink) => backlink.sourcePath),
    ["projects/alpha.md"],
  );
  assert.deepEqual(
    filterBacklinks(backlinks, "daily").map((backlink) => backlink.lineStart),
    [4, 9],
  );
});

test("filters backlinks to blocks with open tasks", () => {
  assert.deepEqual(
    filterBacklinks(backlinks, "", { openTasksOnly: true }).map((backlink) => backlink.lineStart),
    [4],
  );
});

test("filters backlinks to child blocks with open tasks", () => {
  const childTaskBacklinks: BacklinkView[] = [
    {
      sourcePath: "projects/alpha.md",
      sourceTitle: "alpha",
      sourceHeadings: [],
      blockMarkdown: "- Parent [[Team]]\n  - WAITING Follow up",
      lineNumbers: [3, 4],
      lineStart: 3,
    },
    {
      sourcePath: "projects/beta.md",
      sourceTitle: "beta",
      sourceHeadings: [],
      blockMarkdown: "- Parent [[Team]]\n  - DONE Finished",
      lineNumbers: [6, 7],
      lineStart: 6,
    },
  ];

  assert.deepEqual(
    filterBacklinks(childTaskBacklinks, "", { openTasksOnly: true }).map(
      (backlink) => backlink.sourcePath,
    ),
    ["projects/alpha.md"],
  );
});

test("extracts the first non-empty line as short context", () => {
  assert.equal(shortBacklinkContext("\n  - Parent\n    - Child"), "- Parent");
});
