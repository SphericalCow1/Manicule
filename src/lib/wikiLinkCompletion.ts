import type { PageSummary } from "./types";
import { isCompactWikiLinkStart, isValidCompactWikiTarget } from "./wikiLinks.js";

export type WikiLinkCompletionMatch = {
  from: number;
  query: string;
  closingDelimiter: "]]" | "))" | "";
};

export type WikiLinkSuggestion = {
  label: string;
  apply: string;
};

export function matchWikiLinkCompletion(textBeforeCursor: string, cursorPosition: number) {
  const squareOpenIndex = textBeforeCursor.lastIndexOf("[[");
  const roundOpenIndex = textBeforeCursor.lastIndexOf("((");
  const [openIndex, openingDelimiter, closingDelimiter] =
    squareOpenIndex >= roundOpenIndex
      ? [squareOpenIndex, "[[", "]]"]
      : [roundOpenIndex, "((", "))"];

  if (openIndex !== -1) {
    const query = textBeforeCursor.slice(openIndex + openingDelimiter.length);

    if (
      !query.includes("|") &&
      !query.includes("\n") &&
      !(closingDelimiter === "]]" ? query.includes("]") : query.includes(")"))
    ) {
      return {
        from: cursorPosition - query.length,
        query,
        closingDelimiter,
      };
    }
  }

  const compactMatch = /#([\p{L}\p{N}_][\p{L}\p{N}_./-]*)$/u.exec(textBeforeCursor);
  const compactOpen = compactMatch?.index ?? -1;
  const compactQuery = compactMatch?.[1] ?? "";
  if (
    compactOpen === -1 ||
    !isCompactWikiLinkStart(textBeforeCursor, compactOpen) ||
    !isValidCompactCompletionQuery(compactQuery)
  ) {
    return null;
  }

  return {
    from: cursorPosition - compactQuery.length,
    query: compactQuery,
    closingDelimiter: "",
  };
}

export const WIKI_LINK_SUGGESTION_LIMIT = 30;

export function wikiLinkSuggestions(
  query: string,
  pages: PageSummary[],
  limit = WIKI_LINK_SUGGESTION_LIMIT,
  compactOnly = false,
) {
  const normalizedQuery = query.trim().toLowerCase();

  return pages
    .map((page) => ({
      label: stripMarkdownExtension(page.path),
      apply: stripMarkdownExtension(page.path),
    }))
    .filter((suggestion) => !compactOnly || isValidCompactWikiTarget(suggestion.apply))
    .filter((suggestion) => suggestionMatchesQuery(suggestion, normalizedQuery))
    .sort((left, right) => scoreSuggestion(left, normalizedQuery) - scoreSuggestion(right, normalizedQuery))
    .slice(0, limit);
}

function isValidCompactCompletionQuery(query: string) {
  const segments = query.split("/");
  return segments.every(
    (segment, index) =>
      (segment.length === 0 && index === segments.length - 1) ||
      isValidCompactWikiTarget(segment),
  );
}

function suggestionMatchesQuery(suggestion: WikiLinkSuggestion, query: string) {
  if (!query) {
    return true;
  }

  const label = suggestion.label.toLowerCase();
  const leaf = label.split("/").at(-1) ?? label;
  return label.includes(query) || leaf.includes(query);
}

function scoreSuggestion(suggestion: WikiLinkSuggestion, query: string) {
  const label = suggestion.label.toLowerCase();

  if (!query || label.startsWith(query)) {
    return 0;
  }

  const leaf = label.split("/").at(-1) ?? label;
  if (leaf.startsWith(query)) {
    return 1;
  }

  if (leaf.includes(query)) {
    return 2;
  }

  if (label.includes(query)) {
    return 3;
  }

  return 4;
}

function stripMarkdownExtension(value: string) {
  return value.endsWith(".md") ? value.slice(0, -".md".length) : value;
}
