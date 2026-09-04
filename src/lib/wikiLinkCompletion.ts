import type { PageSummary } from "./types";

export type WikiLinkCompletionMatch = {
  from: number;
  query: string;
  closingDelimiter: "]]" | "))";
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

  if (openIndex === -1) {
    return null;
  }

  const query = textBeforeCursor.slice(openIndex + openingDelimiter.length);

  if (
    query.includes("|") ||
    query.includes("\n") ||
    (closingDelimiter === "]]" ? query.includes("]") : query.includes(")"))
  ) {
    return null;
  }

  return {
    from: cursorPosition - query.length,
    query,
    closingDelimiter,
  };
}

export const WIKI_LINK_SUGGESTION_LIMIT = 30;

export function wikiLinkSuggestions(
  query: string,
  pages: PageSummary[],
  limit = WIKI_LINK_SUGGESTION_LIMIT,
) {
  const normalizedQuery = query.trim().toLowerCase();

  return pages
    .map((page) => ({
      label: stripMarkdownExtension(page.path),
      apply: stripMarkdownExtension(page.path),
    }))
    .filter((suggestion) => suggestionMatchesQuery(suggestion, normalizedQuery))
    .sort((left, right) => scoreSuggestion(left, normalizedQuery) - scoreSuggestion(right, normalizedQuery))
    .slice(0, limit);
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
