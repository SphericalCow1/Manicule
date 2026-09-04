import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { checkboxLines } from "../src/lib/checkboxes.js";
import {
  blockIndentWidth,
  blockRangeForLines,
  listBlockPrefix,
} from "../src/lib/editorBlockCommands.js";
import { wikiLinkAtPosition } from "../src/lib/editorLivePreview.js";
import { emphasisSpans } from "../src/lib/editorLivePreview.js";
import {
  DEFAULT_TASK_STATES,
  priorityCookieMatch,
  renderTaskKeywords,
  taskKeywordMatch,
} from "../src/lib/taskKeywords.js";
import type { PageSummary } from "../src/lib/types.js";
import {
  normalizeWikiTargetKey,
  renderWikiLinks,
  wikiLinkDisplayLabel,
} from "../src/lib/wikiLinks.js";

type MarkdownRulesFixture = {
  shared: {
    defaultTaskStates: string[];
    wikiLinks: {
      name: string;
      source: string;
      links: {
        target: string;
        alias: string | null;
        label: string;
      }[];
    }[];
    wikiTargetKeys: {
      name: string;
      target: string;
      key: string | null;
    }[];
    taskLines: {
      name: string;
      source: string;
      taskStates: string[] | null;
      status: string | null;
      priority: string | null;
    }[];
    blockLines: {
      name: string;
      source: string;
      prefix: string | null;
      indent: number;
      checked: boolean | null;
    }[];
    blockDocuments: {
      name: string;
      source: string;
      topLevelBlocks: number;
      firstBlockEnd: number;
      firstBlockChildren: number;
    }[];
    generatedBlockDocuments: {
      name: string;
      depth: number;
      continuationLines: number;
    }[];
  };
  frontendOnly: {
    taskRendering: {
      name: string;
      source: string;
      rendered: string;
    }[];
    emphasis: {
      name: string;
      source: string;
      spans: { start: number; end: number }[];
    }[];
  };
};

const fixtures = JSON.parse(
  readFileSync(join(process.cwd(), "tests/fixtures/markdown-rules.json"), "utf8"),
) as MarkdownRulesFixture;

const pages: PageSummary[] = [
  { exists: true, key: "projects/alpha", path: "Projects/Alpha.md", title: "Alpha" },
  { exists: true, key: "projects/forecasts", path: "projects/forecasts.md", title: "forecasts" },
  {
    exists: true,
    key: "projekte/übersicht",
    path: "Projekte/Übersicht.md",
    title: "Übersicht",
  },
];

test("renders shared wiki-link fixtures consistently", () => {
  for (const fixture of fixtures.shared.wikiLinks) {
    const rendered = renderWikiLinks(fixture.source, pages);

    for (const link of fixture.links) {
      const displayLabel = link.alias ?? wikiLinkDisplayLabel(link.target, pages);
      assert.match(rendered, /\]\(manicule:/, fixture.name);
      assert.ok(rendered.includes(displayLabel), fixture.name);
    }
  }
});

test("detects shared wiki-link fixtures in live preview", () => {
  for (const fixture of fixtures.shared.wikiLinks) {
    for (const link of fixture.links) {
      const squareMarkerIndex = fixture.source.indexOf("[[");
      const roundMarkerIndex = fixture.source.indexOf("((");
      const markerIndex =
        squareMarkerIndex === -1
          ? roundMarkerIndex
          : roundMarkerIndex === -1
            ? squareMarkerIndex
            : Math.min(squareMarkerIndex, roundMarkerIndex);
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

test("normalizes shared wiki-target fixtures consistently", () => {
  for (const fixture of fixtures.shared.wikiTargetKeys) {
    assert.equal(normalizeWikiTargetKey(fixture.target), fixture.key, fixture.name);
  }
});

test("parses shared task fixtures consistently", () => {
  assert.deepEqual(DEFAULT_TASK_STATES, fixtures.shared.defaultTaskStates);

  for (const fixture of fixtures.shared.taskLines) {
    const taskStates = fixture.taskStates ?? DEFAULT_TASK_STATES;
    const task = taskKeywordMatch(fixture.source, 0, taskStates);
    const priority = priorityCookieMatch(fixture.source, 0, taskStates);

    assert.equal(task?.status ?? null, fixture.status, fixture.name);
    assert.equal(priority?.priority ?? null, fixture.priority, fixture.name);
  }
});

test("parses shared list and checkbox fixtures consistently", () => {
  for (const fixture of fixtures.shared.blockLines) {
    assert.equal(listBlockPrefix(fixture.source), fixture.prefix, fixture.name);
    assert.equal(blockIndentWidth(fixture.source), fixture.indent, fixture.name);
    assert.equal(checkboxLines(fixture.source)[0]?.checked ?? null, fixture.checked, fixture.name);
  }
});

test("finds shared nested block ranges consistently", () => {
  for (const fixture of fixtures.shared.blockDocuments) {
    const lines = fixture.source.split(/\r?\n/);
    const firstBlock = blockRangeForLines(lines, 1);
    const topLevelStarts = lines.filter(
      (line) => listBlockPrefix(line) !== null && blockIndentWidth(line) === 0,
    );
    const descendantIndents = lines
      .slice(1, firstBlock.endLine)
      .filter((line) => listBlockPrefix(line) !== null)
      .map(blockIndentWidth)
      .filter((indent) => indent > firstBlock.indent);
    const childIndent = Math.min(...descendantIndents);

    assert.equal(topLevelStarts.length, fixture.topLevelBlocks, fixture.name);
    assert.equal(firstBlock.endLine, fixture.firstBlockEnd, fixture.name);
    assert.equal(
      descendantIndents.filter((indent) => indent === childIndent).length,
      fixture.firstBlockChildren,
      fixture.name,
    );
  }
});

test("handles generated large and deeply nested block documents", () => {
  for (const fixture of fixtures.shared.generatedBlockDocuments) {
    const lines = generatedBlockLines(fixture.depth, fixture.continuationLines);
    const firstBlock = blockRangeForLines(lines, 1);

    assert.equal(firstBlock.endLine, lines.length, fixture.name);
    assert.equal(blockRangeForLines(lines, fixture.depth).endLine, lines.length, fixture.name);
  }
});

test("renders frontend-only task fixtures", () => {
  for (const fixture of fixtures.frontendOnly.taskRendering) {
    assert.equal(renderTaskKeywords(fixture.source), fixture.rendered, fixture.name);
  }
});

test("recognizes frontend-only nested emphasis fixtures", () => {
  for (const fixture of fixtures.frontendOnly.emphasis) {
    assert.deepEqual(emphasisSpans(fixture.source), fixture.spans, fixture.name);
  }
});

function generatedBlockLines(depth: number, continuationLines: number) {
  const lines = Array.from(
    { length: depth },
    (_, level) => `${"  ".repeat(level)}- Level ${level + 1}`,
  );
  const continuationIndent = "  ".repeat(depth);
  for (let index = 1; index <= continuationLines; index += 1) {
    lines.push(`${continuationIndent}Continuation ${index}`);
  }
  return lines;
}
