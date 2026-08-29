import type { FolderColors, PageSummary, TaskColorName } from "./types";

export const FOLDER_COLOR_OPTIONS: TaskColorName[] = [
  "red",
  "yellow",
  "green",
  "blue",
  "grey",
  "orange",
  "pink",
];

type LinkColorTokens = {
  background: string;
  foreground: string;
  border: string;
  folderFill: string;
  folderTab: string;
  folderBorder: string;
};

const defaultLinkColor: TaskColorName = "blue";
const folderColorNames = new Set<TaskColorName>(FOLDER_COLOR_OPTIONS);

export function folderColorForPath(path: string, folderColors: FolderColors = {}) {
  const folderPath = folderPathForPage(path);
  return inheritedFolderColor(folderPath, folderColors);
}

export function linkColorForTarget(
  target: string,
  pages: PageSummary[],
  folderColors: FolderColors = {},
) {
  const key = normalizeWikiTargetKey(target);
  const resolvedPath = pages.find((page) => page.key === key)?.path;
  if (!resolvedPath) {
    return null;
  }

  return folderColorForPath(resolvedPath, folderColors);
}

export function wikiLinkColorStyle(
  target: string,
  pages: PageSummary[],
  folderColors: FolderColors = {},
) {
  return linkChipStyle(linkColorForTarget(target, pages, folderColors) ?? defaultLinkColor);
}

export function linkChipStyle(color: TaskColorName = defaultLinkColor) {
  const tokenColor = folderColorNames.has(color) ? color : defaultLinkColor;
  const tokens = folderColorTokens(tokenColor);
  return `background-color: ${tokens.background}; color: ${tokens.foreground}; border-bottom-color: ${tokens.border};`;
}

export function folderGlyphStyle(color: TaskColorName | null) {
  if (!color) {
    return "";
  }

  const tokenColor = folderColorNames.has(color) ? color : defaultLinkColor;
  const tokens = folderColorTokens(tokenColor);
  return `--folder-fill: ${tokens.folderFill}; --folder-tab: ${tokens.folderTab}; --folder-border: ${tokens.folderBorder};`;
}

function folderColorTokens(color: TaskColorName): LinkColorTokens {
  return {
    background: `var(--folder-color-${color}-chip-bg)`,
    foreground: `var(--folder-color-${color}-chip-text)`,
    border: `var(--folder-color-${color}-chip-border)`,
    folderFill: `var(--folder-color-${color}-fill)`,
    folderTab: `var(--folder-color-${color}-tab)`,
    folderBorder: `var(--folder-color-${color}-border)`,
  };
}

export function inheritedFolderColor(
  folderPath: string,
  folderColors: FolderColors = {},
): TaskColorName | null {
  let current = normalizeFolderPath(folderPath);

  while (true) {
    const color = folderColors[current];
    if (color) {
      return color;
    }

    if (!current) {
      return null;
    }

    const slash = current.lastIndexOf("/");
    current = slash === -1 ? "" : current.slice(0, slash);
  }
}

function folderPathForPage(path: string) {
  const normalized = normalizeFolderPath(path);
  const slash = normalized.lastIndexOf("/");
  return slash === -1 ? "" : normalized.slice(0, slash);
}

function normalizeFolderPath(path: string) {
  return path.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

function normalizeWikiTargetKey(target: string) {
  const trimmed = target.trim();
  const withoutExtension = trimmed.endsWith(".md") ? trimmed.slice(0, -3) : trimmed;
  return withoutExtension.toLowerCase();
}
