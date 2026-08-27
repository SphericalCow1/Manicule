import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { renderTaskKeywords } from "../src/lib/taskKeywords.js";
import { renderWikiLinks, wikiLinkDisplayLabel } from "../src/lib/wikiLinks.js";
import { wikiLinkAtPosition } from "../src/lib/editorLivePreview.js";
import type { PageSummary } from "../src/lib/types.js";

type MarkdownRulesFixture = {
  wikiLinks: {
    name: string;
    source: string;
    links: {
      target: string;
      alias: string | null;
      label: string;
    }[];
  }[];
  taskLines: {
    name: string;
    source: string;
    status: string | null;
    rendered: string;
  }[];
};

const fixtures = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/markdown-rules.json"), "utf8"),
) as MarkdownRulesFixture;

const pages: PageSummary[] = [
  { exists: true, key: "projects/alpha", path: "Projects/Alpha.md", title: "Alpha" },
  { exists: true, key: "projects/forecasts", path: "projects/forecasts.md", title: "forecasts" },
];

test("renders shared wiki-link fixtures consistently", () => {
  for (const fixture of fixtures.wikiLinks) {
    const rendered = renderWikiLinks(fixture.source, pages);

    for (const link of fixture.links) {
      const displayLabel = link.alias ?? wikiLinkDisplayLabel(link.target, pages);
      assert.match(rendered, /\]\(semtags:/, fixture.name);
      assert.ok(rendered.includes(displayLabel), fixture.name);
    }
  }
});

test("detects shared wiki-link fixtures in live preview", () => {
  for (const fixture of fixtures.wikiLinks) {
    for (const link of fixture.links) {
      const markerIndex = fixture.source.indexOf("[[");
      const linkAtPosition = wikiLinkAtPosition(fixture.source, 0, markerIndex + 2);

      assert.deepEqual(
        linkAtPosition && {
          target: linkAtPosition.target,
          label: linkAtPosition.label,
        },
        {
          target: link.target,
          label: link.label,
        },
        fixture.name,
      );
    }
  }
});

test("renders shared task-keyword fixtures consistently", () => {
  for (const fixture of fixtures.taskLines) {
    assert.equal(renderTaskKeywords(fixture.source), fixture.rendered, fixture.name);
  }
});
