import assert from "node:assert/strict";
import test from "node:test";

import {
  matchWikiLinkCompletion,
  wikiLinkSuggestions,
} from "../src/lib/wikiLinkCompletion.js";
import type { PageSummary } from "../src/lib/types.js";

const pages: PageSummary[] = [
  { exists: true, key: "projects/forecasts", path: "projects/forecasts.md", title: "forecasts" },
  { exists: true, key: "team/nadine", path: "team/nadine.md", title: "nadine" },
];

test("matches text after an open wiki link marker", () => {
  assert.deepEqual(matchWikiLinkCompletion("- siehe [[pro", 14), {
    from: 11,
    query: "pro",
    closingDelimiter: "]]",
  });
});

test("matches text after an open round-delimited wiki link marker", () => {
  assert.deepEqual(matchWikiLinkCompletion("- siehe ((pro", 14), {
    from: 11,
    query: "pro",
    closingDelimiter: "))",
  });
});

test("matches compact link completion after a hash marker", () => {
  assert.deepEqual(matchWikiLinkCompletion("- see #pro", 10), {
    from: 7,
    query: "pro",
    closingDelimiter: "",
  });
});

test("does not treat headings or task priorities as compact link completion", () => {
  assert.equal(matchWikiLinkCompletion("# Heading", 9), null);
  assert.equal(matchWikiLinkCompletion("[#A", 3), null);
  assert.equal(matchWikiLinkCompletion("word#Alpha", 10), null);
});

test("does not match aliases or closed wiki links", () => {
  assert.equal(matchWikiLinkCompletion("[[projects|Alias", 16), null);
  assert.equal(matchWikiLinkCompletion("[[projects]]", 12), null);
  assert.equal(matchWikiLinkCompletion("((projects|Alias", 16), null);
  assert.equal(matchWikiLinkCompletion("((projects))", 12), null);
});

test("suggests matching pages without markdown extensions", () => {
  assert.deepEqual(wikiLinkSuggestions("fore", pages), [
    {
      label: "projects/forecasts",
      apply: "projects/forecasts",
    },
  ]);
});

test("does not suggest pages that do not contain the typed query", () => {
  assert.deepEqual(wikiLinkSuggestions("xyz", pages), []);
  assert.deepEqual(wikiLinkSuggestions("tea", pages), [
    {
      label: "team/nadine",
      apply: "team/nadine",
    },
  ]);
});

test("matches substrings in the full path and filename", () => {
  assert.deepEqual(wikiLinkSuggestions("ject", pages), [
    {
      label: "projects/forecasts",
      apply: "projects/forecasts",
    },
  ]);
  assert.deepEqual(wikiLinkSuggestions("cast", pages), [
    {
      label: "projects/forecasts",
      apply: "projects/forecasts",
    },
  ]);
});

test("ranks prefix matches before substring matches", () => {
  const orderedPages: PageSummary[] = [
    { exists: true, key: "archive/projector", path: "archive/projector.md", title: "projector" },
    { exists: true, key: "team/alpha-project", path: "team/alpha-project.md", title: "alpha-project" },
  ];

  assert.deepEqual(wikiLinkSuggestions("pro", orderedPages).map((suggestion) => suggestion.label), [
    "archive/projector",
    "team/alpha-project",
  ]);
});

test("matches both full path prefix and filename prefix", () => {
  assert.deepEqual(wikiLinkSuggestions("team", pages), [
    {
      label: "team/nadine",
      apply: "team/nadine",
    },
  ]);
  assert.deepEqual(wikiLinkSuggestions("nad", pages), [
    {
      label: "team/nadine",
      apply: "team/nadine",
    },
  ]);
});

test("keeps full suggestion labels in the dropdown", () => {
  const collidingPages: PageSummary[] = [
    { exists: true, key: "projects/prognose", path: "projects/prognose.md", title: "prognose" },
    { exists: true, key: "processes/prognose", path: "processes/prognose.md", title: "prognose" },
  ];

  assert.deepEqual(wikiLinkSuggestions("progn", collidingPages), [
    {
      label: "projects/prognose",
      apply: "projects/prognose",
    },
    {
      label: "processes/prognose",
      apply: "processes/prognose",
    },
  ]);
});

test("compact completion excludes page targets containing spaces", () => {
  const compactPages: PageSummary[] = [
    ...pages,
    { exists: true, key: "projects/new alpha", path: "projects/new alpha.md", title: "New Alpha" },
  ];

  assert.deepEqual(wikiLinkSuggestions("pro", compactPages, undefined, true), [
    {
      label: "projects/forecasts",
      apply: "projects/forecasts",
    },
  ]);
});

test("returns up to thirty suggestions by default", () => {
  const manyPages: PageSummary[] = Array.from({ length: 35 }, (_, index) => {
    const padded = String(index + 1).padStart(2, "0");
    return {
      exists: true,
      key: `team/topic-${padded}`,
      path: `team/topic-${padded}.md`,
      title: `topic-${padded}`,
    };
  });

  const suggestions = wikiLinkSuggestions("topic", manyPages);

  assert.equal(suggestions.length, 30);
  assert.equal(suggestions[0].label, "team/topic-01");
  assert.equal(suggestions.at(-1)?.label, "team/topic-30");
});
