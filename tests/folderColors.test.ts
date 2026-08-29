import assert from "node:assert/strict";
import test from "node:test";

import {
  folderColorForPath,
  folderGlyphStyle,
  inheritedFolderColor,
  linkChipStyle,
  linkColorForTarget,
} from "../src/lib/folderColors.js";
import type { PageSummary } from "../src/lib/types.js";

const pages: PageSummary[] = [
  {
    exists: true,
    key: "projects/alpha/forecast",
    path: "projects/alpha/Forecast.md",
    title: "Forecast",
  },
  {
    exists: true,
    key: "journal/2026-08-21",
    path: "journal/2026-08-21.md",
    title: "2026-08-21",
  },
];

test("inherits folder colors from parent folders", () => {
  assert.equal(folderColorForPath("projects/alpha/Forecast.md", { projects: "blue" }), "blue");
});

test("lets child folder colors override parent folder colors", () => {
  assert.equal(
    folderColorForPath("projects/alpha/Forecast.md", {
      projects: "blue",
      "projects/alpha": "orange",
    }),
    "orange",
  );
});

test("inherits the nearest nested folder color", () => {
  assert.equal(
    folderColorForPath("projects/alpha/deep/Forecast.md", {
      projects: "blue",
      "projects/alpha": "pink",
    }),
    "pink",
  );
});

test("returns null when no folder color applies", () => {
  assert.equal(inheritedFolderColor("projects/alpha", { journal: "grey" }), null);
});

test("resolves wiki link target colors case insensitively", () => {
  assert.equal(
    linkColorForTarget("Projects/Alpha/forecast", pages, {
      projects: "pink",
    }),
    "pink",
  );
});

test("builds theme-aware link chip styles", () => {
  assert.equal(
    linkChipStyle("orange"),
    "background-color: var(--folder-color-orange-chip-bg); color: var(--folder-color-orange-chip-text); border-bottom-color: var(--folder-color-orange-chip-border);",
  );
});

test("builds theme-aware folder glyph styles", () => {
  assert.equal(
    folderGlyphStyle("pink"),
    "--folder-fill: var(--folder-color-pink-fill); --folder-tab: var(--folder-color-pink-tab); --folder-border: var(--folder-color-pink-border);",
  );
});
