import type { ManualPageOrder, PageSortMode, PageSummary } from "./types";

export type NavigationNode = FolderNode | PageNode;

export type FolderNode = {
  kind: "folder";
  name: string;
  path: string;
  children: NavigationNode[];
};

export type PageNode = {
  kind: "page";
  name: string;
  path: string;
  page: PageSummary;
};

export type VisibleNavigationRow = {
  node: NavigationNode;
  depth: number;
};

export function buildNavigationTree(
  pages: PageSummary[],
  folders: string[] = [],
  defaultPageSort: PageSortMode = "name-desc",
  folderPageSort: Record<string, PageSortMode> = {},
  manualPageOrder: ManualPageOrder = {},
): FolderNode {
  const root: FolderNode = {
    kind: "folder",
    name: "",
    path: "",
    children: [],
  };

  for (const folderPath of folders) {
    ensureFolder(root, folderPath);
  }

  for (const page of pages) {
    const parts = page.path.split("/");
    const folder = ensureFolder(root, parts.slice(0, -1).join("/"));

    folder.children.push({
      kind: "page",
      name: pageNameFromPath(page.path),
      path: page.path,
      page,
    });
  }

  sortTree(root, defaultPageSort, folderPageSort, manualPageOrder);
  return root;
}

function ensureFolder(root: FolderNode, path: string) {
  let folder = root;
  const parts = path.split("/").filter(Boolean);

  for (const part of parts) {
    const childPath = folder.path ? `${folder.path}/${part}` : part;
    let child = folder.children.find(
      (node): node is FolderNode => node.kind === "folder" && node.path === childPath,
    );

    if (!child) {
      child = {
        kind: "folder",
        name: part,
        path: childPath,
        children: [],
      };
      folder.children.push(child);
    }

    folder = child;
  }

  return folder;
}

export function collectFolderPaths(root: FolderNode): string[] {
  const paths: string[] = [];

  for (const child of root.children) {
    if (child.kind === "folder") {
      paths.push(child.path, ...collectFolderPaths(child));
    }
  }

  return paths;
}

export function flattenVisibleTree(root: FolderNode, expandedFolders: Set<string>) {
  const rows: VisibleNavigationRow[] = [];

  for (const child of root.children) {
    appendVisibleNode(child, 0, expandedFolders, rows);
  }

  return rows;
}

export function ancestorFolderPaths(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  const ancestors: string[] = [];

  for (let index = 1; index < parts.length; index += 1) {
    ancestors.push(parts.slice(0, index).join("/"));
  }

  return ancestors;
}

export function folderExists(root: FolderNode, path: string) {
  return collectFolderPaths(root).includes(path);
}

function appendVisibleNode(
  node: NavigationNode,
  depth: number,
  expandedFolders: Set<string>,
  rows: VisibleNavigationRow[],
) {
  rows.push({ node, depth });

  if (node.kind === "folder" && expandedFolders.has(node.path)) {
    for (const child of node.children) {
      appendVisibleNode(child, depth + 1, expandedFolders, rows);
    }
  }
}

function sortTree(
  folder: FolderNode,
  defaultPageSort: PageSortMode,
  folderPageSort: Record<string, PageSortMode>,
  manualPageOrder: ManualPageOrder,
) {
  const pageSort = folderPageSort[folder.path] ?? defaultPageSort;
  const manualOrder = manualPageOrder[folder.path] ?? [];
  const manualRank = new Map(manualOrder.map((path, index) => [path.toLowerCase(), index]));

  folder.children.sort((left, right) => {
    if (manualRank.size > 0) {
      const leftRank = manualRank.get(left.path.toLowerCase());
      const rightRank = manualRank.get(right.path.toLowerCase());

      if (leftRank !== undefined || rightRank !== undefined) {
        if (leftRank === undefined) {
          return 1;
        }
        if (rightRank === undefined) {
          return -1;
        }
        if (leftRank !== rightRank) {
          return leftRank - rightRank;
        }
      }
    }

    return compareNavigationNodes(left, right, pageSort);
  });

  for (const child of folder.children) {
    if (child.kind === "folder") {
      sortTree(child, defaultPageSort, folderPageSort, manualPageOrder);
    }
  }
}

function compareNavigationNodes(left: NavigationNode, right: NavigationNode, pageSort: PageSortMode) {
  if (left.kind !== right.kind) {
    return left.kind === "folder" ? -1 : 1;
  }

  if (left.kind === "page" && right.kind === "page") {
    return comparePages(left, right, pageSort);
  }

  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}

function comparePages(left: PageNode, right: PageNode, sort: PageSortMode) {
  if (sort === "name-asc" || sort === "modified-asc") {
    return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
  }

  return right.name.localeCompare(left.name, undefined, { sensitivity: "base" });
}

export function pageNameFromPath(path: string) {
  const leaf = path.split("/").at(-1) || path;
  return leaf.endsWith(".md") ? leaf.slice(0, -3) : leaf;
}
