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

const palette: Record<TaskColorName, LinkColorTokens> = {
  red: {
    background: "#fee2e2",
    foreground: "#991b1b",
    border: "#fca5a5",
    folderFill: "#fca5a5",
    folderTab: "#fecaca",
    folderBorder: "#b91c1c",
  },
  yellow: {
    background: "#fef3c7",
    foreground: "#854d0e",
    border: "#facc15",
    folderFill: "#facc15",
    folderTab: "#fde68a",
    folderBorder: "#a16207",
  },
  green: {
    background: "#dcfce7",
    foreground: "#166534",
    border: "#86efac",
    folderFill: "#86efac",
    folderTab: "#bbf7d0",
    folderBorder: "#15803d",
  },
  blue: {
    background: "#edf5ff",
    foreground: "#145ea8",
    border: "#9cc7f2",
    folderFill: "#93c5fd",
    folderTab: "#bfdbfe",
    folderBorder: "#2563eb",
  },
  grey: {
    background: "#f1f5f9",
    foreground: "#475569",
    border: "#cbd5e1",
    folderFill: "#cbd5e1",
    folderTab: "#e2e8f0",
    folderBorder: "#64748b",
  },
  orange: {
    background: "#ffedd5",
    foreground: "#9a3412",
    border: "#fdba74",
    folderFill: "#fdba74",
    folderTab: "#fed7aa",
    folderBorder: "#c2410c",
  },
  pink: {
    background: "#f5e8ff",
    foreground: "#7e22ce",
    border: "#d8b4fe",
    folderFill: "#c084fc",
    folderTab: "#e9d5ff",
    folderBorder: "#9333ea",
  },
};

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
  const tokens = palette[color] ?? palette[defaultLinkColor];
  return `background-color: ${tokens.background}; color: ${tokens.foreground}; border-bottom-color: ${tokens.border};`;
}

export function folderGlyphStyle(color: TaskColorName | null) {
  if (!color) {
    return "";
  }

  const tokens = palette[color] ?? palette[defaultLinkColor];
  return `--folder-fill: ${tokens.folderFill}; --folder-tab: ${tokens.folderTab}; --folder-border: ${tokens.folderBorder};`;
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
