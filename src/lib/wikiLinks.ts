import type { FolderColors, PageSummary } from "./types";
import { wikiLinkColorStyle } from "./folderColors.js";

export type ResolvedWikiTarget =
  | {
      exists: true;
      path: string;
      key: string;
    }
  | {
      exists: false;
      path: string;
      key: string;
    };

export type WikiLinkSyntax = "square" | "round" | "compact";

export type WikiLinkMatch = {
  from: number;
  to: number;
  raw: string;
  target: string;
  alias: string | null;
  syntax: WikiLinkSyntax;
};

const compactSegmentPattern = String.raw`[\p{L}\p{N}_](?:[\p{L}\p{N}_-]|\.(?=[\p{L}\p{N}_]))*`;
const compactTargetPattern = `${compactSegmentPattern}(?:/${compactSegmentPattern})*`;
const wikiLinkPattern = new RegExp(
  String.raw`\[\[([^\]\n]+)\]\]|\(\(([^)\n]+)\)\)|#(${compactTargetPattern})`,
  "gu",
);
const compactTargetPatternExact = new RegExp(`^${compactTargetPattern}$`, "u");
const compactSegmentCharacter = /^[\p{L}\p{N}_-]$/u;

export function normalizeWikiTargetKey(target: string): string | null {
  const withoutExtension = stripMarkdownExtension(target.trim());

  if (!isValidWikiTarget(withoutExtension)) {
    return null;
  }

  return withoutExtension.toLowerCase();
}

export function wikiTargetToMarkdownPath(target: string): string | null {
  const withoutExtension = stripMarkdownExtension(target.trim());

  if (!isValidWikiTarget(withoutExtension)) {
    return null;
  }

  return `${withoutExtension}.md`;
}

export function resolveWikiTarget(target: string, pages: PageSummary[]): ResolvedWikiTarget | null {
  const key = normalizeWikiTargetKey(target);
  const fallbackPath = wikiTargetToMarkdownPath(target);

  if (!key || !fallbackPath) {
    return null;
  }

  const page = pages.find((candidate) => candidate.key === key);

  if (page) {
    return {
      exists: true,
      key,
      path: page.path,
    };
  }

  return {
    exists: false,
    key,
    path: fallbackPath,
  };
}

export function wikiLinkHref(target: string, pages: PageSummary[]): string | null {
  const resolved = resolveWikiTarget(target, pages);

  if (!resolved) {
    return null;
  }

  const scheme = resolved.exists || pages.length === 0 ? "manicule" : "manicule-missing";
  return `${scheme}:${encodeURIComponent(resolved.path)}`;
}

export function renderWikiLinks(source: string, pages: PageSummary[] = []) {
  let rendered = "";
  let cursor = 0;

  for (const match of wikiLinksInText(source)) {
    rendered += source.slice(cursor, match.from);
    const target = match.target;
    const href = wikiLinkHref(target, pages);

    if (!href) {
      rendered += match.raw;
      cursor = match.to;
      continue;
    }

    const displayLabel = match.alias || wikiLinkDisplayLabel(target, pages);
    const label = match.syntax === "compact" ? `#${displayLabel}` : displayLabel;
    rendered += `[${escapeMarkdownLabel(label)}](${href})`;
    cursor = match.to;
  }

  return rendered + source.slice(cursor);
}

export function wikiLinksInText(source: string): WikiLinkMatch[] {
  const links: WikiLinkMatch[] = [];

  for (const match of source.matchAll(wikiLinkPattern)) {
    const from = match.index ?? 0;
    const raw = match[0];
    const compactTarget = match[3];
    const syntax: WikiLinkSyntax = compactTarget
      ? "compact"
      : match[1] !== undefined
        ? "square"
        : "round";

    if (
      isMarkdownCodePosition(source, from) ||
      (syntax === "compact" && isMarkdownLinkLabelPosition(source, from)) ||
      (syntax === "compact" && !isCompactWikiLinkStart(source, from))
    ) {
      continue;
    }

    const inner = compactTarget ?? match[1] ?? match[2];
    const [rawTarget, rawAlias] = inner.split("|", 2);
    const target = rawTarget.trim();
    if (!isValidWikiTarget(target)) {
      continue;
    }

    links.push({
      from,
      to: from + raw.length,
      raw,
      target,
      alias: syntax === "compact" ? null : rawAlias?.trim() || null,
      syntax,
    });
  }

  return links;
}

export function isValidCompactWikiTarget(target: string) {
  return compactTargetPatternExact.test(target) && isValidWikiTarget(target);
}

export function wikiLinkDisplayLabel(target: string, pages: PageSummary[] = []) {
  const resolved = resolveWikiTarget(target, pages);
  if (!resolved?.exists) {
    return stripMarkdownExtension(target.trim());
  }

  return compactPageLabel(resolved.path, pages);
}

export function compactPageLabel(path: string, pages: PageSummary[] = []) {
  const normalizedPath = stripMarkdownExtension(path.trim()).replace(/\\/g, "/");
  const targetSegments = normalizedPath.split("/").filter(Boolean);
  const targetLeaf = targetSegments.at(-1) ?? normalizedPath;
  const matchingPages = pages
    .map((page) => stripMarkdownExtension(page.path).replace(/\\/g, "/"))
    .filter((candidate) => {
      const candidateLeaf = candidate.split("/").filter(Boolean).at(-1) ?? candidate;
      return candidateLeaf.toLowerCase() === targetLeaf.toLowerCase();
    });

  if (matchingPages.length <= 1) {
    return targetLeaf;
  }

  for (let segmentCount = 2; segmentCount <= targetSegments.length; segmentCount += 1) {
    const suffix = targetSegments.slice(-segmentCount).join("/");
    const sameSuffixCount = matchingPages.filter((candidate) =>
      candidate.toLowerCase().endsWith(suffix.toLowerCase()),
    ).length;

    if (sameSuffixCount === 1) {
      return suffix;
    }
  }

  return normalizedPath;
}

export function compactPageFolderLabel(path: string, pages: PageSummary[] = []) {
  const label = compactPageLabel(path, pages);
  const slash = label.lastIndexOf("/");
  return slash === -1 ? "" : label.slice(0, slash);
}

export function applyWikiLinkColorStyles(
  html: string,
  pages: PageSummary[] = [],
  folderColors: FolderColors = {},
) {
  return html.replace(
    /<a href="(manicule:[^"]+)"([^>]*)>/g,
    (match, href: string, rest: string) => {
      const target = decodeURIComponent(href.slice("manicule:".length));
      const style = wikiLinkColorStyle(target, pages, folderColors);

      if (rest.includes("style=")) {
        return match;
      }

      return `<a href="${href}"${rest} class="wiki-link-chip" style="${style}">`;
    },
  );
}

function stripMarkdownExtension(value: string) {
  return value.endsWith(".md") ? value.slice(0, -".md".length) : value;
}

function isValidWikiTarget(target: string) {
  return (
    target.length > 0 &&
    !target.startsWith("/") &&
    target.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..")
  );
}

function escapeMarkdownLabel(label: string) {
  return label.replace(/([\\\]])/g, "\\$1");
}

export function isCompactWikiLinkStart(source: string, from: number) {
  if (from === 0) {
    return true;
  }

  const previous = [...source.slice(0, from)].at(-1);
  return Boolean(
    previous &&
      !compactSegmentCharacter.test(previous) &&
      !["#", "[", "/", "\\", ":", "@", "="].includes(previous),
  );
}

function isMarkdownCodePosition(source: string, position: number) {
  const lineStart = source.lastIndexOf("\n", position - 1) + 1;
  let fence: { marker: string; length: number } | null = null;

  for (const line of source.slice(0, lineStart).split("\n")) {
    const marker = markdownFenceMarker(line);
    if (!marker) {
      continue;
    }

    if (fence?.marker === marker.marker && marker.length >= fence.length) {
      fence = null;
    } else if (!fence) {
      fence = marker;
    }
  }

  const linePrefix = source.slice(lineStart, position);
  return Boolean(fence || markdownFenceMarker(linePrefix) || hasUnclosedInlineCode(linePrefix));
}

function isMarkdownLinkLabelPosition(source: string, position: number) {
  const lineStart = source.lastIndexOf("\n", position - 1) + 1;
  const lineEnd = source.indexOf("\n", position);
  const line = source.slice(lineStart, lineEnd === -1 ? source.length : lineEnd);
  const relativePosition = position - lineStart;
  const openBracket = line.lastIndexOf("[", relativePosition);
  if (openBracket === -1) {
    return false;
  }

  const closeBracket = line.indexOf("]", relativePosition);
  if (closeBracket === -1) {
    return false;
  }

  const afterLabel = line.slice(closeBracket + 1);
  return afterLabel.startsWith("(") || afterLabel.startsWith("[");
}

function markdownFenceMarker(line: string) {
  const match = /^\s*(`{3,}|~{3,})/.exec(line);
  return match ? { marker: match[1][0], length: match[1].length } : null;
}

function hasUnclosedInlineCode(linePrefix: string) {
  let openLength: number | null = null;

  for (let index = 0; index < linePrefix.length; ) {
    if (linePrefix[index] !== "`" || (index > 0 && linePrefix[index - 1] === "\\")) {
      index += 1;
      continue;
    }

    let end = index + 1;
    while (linePrefix[end] === "`") {
      end += 1;
    }
    const runLength = end - index;
    openLength = openLength === runLength ? null : openLength ?? runLength;
    index = end;
  }

  return openLength !== null;
}
