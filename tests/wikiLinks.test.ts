import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWikiLinkColorStyles,
  compactPageFolderLabel,
  compactPageLabel,
  renderWikiLinks,
  resolveWikiTarget,
  wikiLinksInText,
  wikiLinkDisplayLabel,
  wikiLinkHref,
} from "../src/lib/wikiLinks.js";
import type { PageSummary } from "../src/lib/types.js";

const pages: PageSummary[] = [
  {
    exists: true,
    key: "projects/forecasts",
    path: "Projects/Forecasts.md",
    title: "Forecasts",
  },
];

const collidingPages: PageSummary[] = [
  { exists: true, key: "projects/prognose", path: "projects/prognose.md", title: "prognose" },
  { exists: true, key: "processes/prognose", path: "processes/prognose.md", title: "prognose" },
  { exists: true, key: "archive/alpha/report", path: "archive/alpha/report.md", title: "report" },
  { exists: true, key: "active/alpha/report", path: "active/alpha/report.md", title: "report" },
];

test("renders wiki links with markdown extensions to the existing page path", () => {
  assert.equal(
    renderWikiLinks("[[projects/forecasts.md]]", pages),
    "[Forecasts](manicule:Projects%2FForecasts.md)",
  );
});

test("keeps explicit wiki link aliases", () => {
  assert.equal(
    renderWikiLinks("[[projects/forecasts.md|Forecast]]", pages),
    "[Forecast](manicule:Projects%2FForecasts.md)",
  );
});

test("renders round-delimited wiki links with the same semantics", () => {
  assert.equal(
    renderWikiLinks("((projects/forecasts.md|Forecast))", pages),
    "[Forecast](manicule:Projects%2FForecasts.md)",
  );
});

test("renders compact links with a visible hash marker", () => {
  assert.equal(
    renderWikiLinks("See #projects/forecasts today", pages),
    "See [#Forecasts](manicule:Projects%2FForecasts.md) today",
  );
});

test("renders missing compact links with the existing creation workflow", () => {
  assert.equal(
    renderWikiLinks("See #Missing/Page", pages),
    "See [#Missing/Page](manicule-missing:Missing%2FPage.md)",
  );
});

test("ignores compact link lookalikes and Markdown code", () => {
  const source =
    "# Heading [#A] word#Alpha https://example.test/#Alpha `#Alpha` [Label #Alpha](https://example.test)\n```md\n#Alpha\n```";

  assert.deepEqual(wikiLinksInText(source), []);
  assert.equal(renderWikiLinks(source, pages), source);
});

test("marks missing wiki targets with a non-navigating scheme", () => {
  assert.equal(wikiLinkHref("Missing/Page", pages), "manicule-missing:Missing%2FPage.md");
});

test("resolves wiki targets case insensitively", () => {
  assert.deepEqual(resolveWikiTarget("projects/FORECASTS", pages), {
    exists: true,
    key: "projects/forecasts",
    path: "Projects/Forecasts.md",
  });
});

test("adds folder color styles to rendered wiki link anchors", () => {
  const html = '<p><a href="manicule:Projects%2FForecasts.md">Forecast</a></p>';

  assert.equal(
    applyWikiLinkColorStyles(html, pages, { Projects: "orange" }),
    '<p><a href="manicule:Projects%2FForecasts.md" class="wiki-link-chip" style="background-color: var(--folder-color-orange-chip-bg); color: var(--folder-color-orange-chip-text); border-bottom-color: var(--folder-color-orange-chip-border);">Forecast</a></p>',
  );
});

test("uses only the page name for unique wiki link labels", () => {
  assert.equal(wikiLinkDisplayLabel("projects/forecasts", pages), "Forecasts");
});

test("uses the shortest distinguishing path for colliding page names", () => {
  assert.equal(compactPageLabel("projects/prognose.md", collidingPages), "projects/prognose");
  assert.equal(compactPageLabel("processes/prognose.md", collidingPages), "processes/prognose");
  assert.equal(compactPageLabel("archive/alpha/report.md", collidingPages), "archive/alpha/report");
  assert.equal(compactPageLabel("active/alpha/report.md", collidingPages), "active/alpha/report");
});

test("uses only distinguishing folders for page source labels", () => {
  assert.equal(compactPageFolderLabel("Projects/Forecasts.md", pages), "");
  assert.equal(compactPageFolderLabel("projects/prognose.md", collidingPages), "projects");
  assert.equal(compactPageFolderLabel("archive/alpha/report.md", collidingPages), "archive/alpha");
});
