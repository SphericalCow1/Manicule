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
  return source.replace(/\[\[([^\]\n]+)\]\]|\(\(([^)\n]+)\)\)/g, (match, squareInner?: string, roundInner?: string) => {
    const inner = squareInner ?? roundInner;
    if (!inner) {
      return match;
    }
    const [rawTarget, rawAlias] = inner.split("|", 2);
    const target = rawTarget.trim();
    const href = wikiLinkHref(target, pages);

    if (!href) {
      return match;
    }

    const label = rawAlias?.trim() || wikiLinkDisplayLabel(target, pages);
    return `[${escapeMarkdownLabel(label)}](${href})`;
  });
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
