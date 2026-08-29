export type DiagnosticSeverity = "Info" | "Warning" | "Error";

export type Diagnostic = {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  path?: string;
};

export type PageSummary = {
  path: string;
  title: string;
  key: string;
  exists: boolean;
};

export type PageContent = {
  path: string;
  content: string;
  modifiedAt: string;
  contentHash: string;
};

export type SavePageResult =
  | {
      status: "saved";
      path: string;
      modifiedAt: string;
      contentHash: string;
    }
  | {
      status: "conflict";
      path: string;
      currentModifiedAt: string;
      currentContentHash: string;
      diskContent: string;
    };

export type BacklinkView = {
  sourcePath: string;
  sourceTitle: string;
  sourceHeadings: string[];
  blockMarkdown: string;
  lineNumbers: number[];
  lineStart: number;
};

export type PageView = {
  page: PageSummary;
  content: string;
  backlinks: BacklinkView[];
  diagnostics: Diagnostic[];
};

export type SearchResult = {
  path: string;
  title: string;
  line: number;
  excerpt: string;
};

export type TaskStatus = string;
export type TaskColorName = "red" | "yellow" | "green" | "blue" | "grey" | "orange" | "pink";
export type TaskStateColors = Record<string, TaskColorName>;
export type FolderColors = Record<string, TaskColorName>;

export type TaskOverviewGroupMode = "status" | "priority" | "source" | "folder" | "linked-page";
export type PageSortMode = "name-desc" | "name-asc" | "modified-desc" | "modified-asc";
export type ManualPageOrder = Record<string, string[]>;
export type ThemeMode = "light" | "dark";

export type TaskOverviewConfig = {
  statusFilter: string;
  priorityFilter: string;
  textFilter: string;
  groupMode: TaskOverviewGroupMode;
};

export type BacklinkViewConfig = {
  openTasksOnly: boolean;
};

export type TaskLink = {
  target: string;
  label: string;
  resolvedPath: string | null;
  exists: boolean;
};

export type TaskItem = {
  path: string;
  title: string;
  line: number;
  status: TaskStatus;
  priority: string | null;
  sourceHeadings: string[];
  parentBlocks: string[];
  linkedPages: TaskLink[];
  text: string;
  markdown: string;
};

export type UpdateTaskStatusResult = {
  task: TaskItem;
};

export type ToggleCheckboxResult = {
  path: string;
  line: number;
  checked: boolean;
};

export type WorkspaceState = {
  root: string;
  pages: PageSummary[];
  folders: string[];
  diagnostics: Diagnostic[];
  taskStates: TaskStatus[];
  taskStateColors: TaskStateColors;
  taskDoneSoundEnabled: boolean;
  defaultPageSort: PageSortMode;
  folderPageSort: Record<string, PageSortMode>;
  manualPageOrder: ManualPageOrder;
  folderColors: FolderColors;
  expandedFolders: string[] | null;
  pageFavorites: string[];
  recentPages: string[];
  navigationLayout: NavigationLayoutConfig;
  taskOverview: TaskOverviewConfig;
  backlinkView: BacklinkViewConfig;
  themeMode: ThemeMode;
  lastEditorPath: string | null;
  lastRightPanePath: string | null;
};

export type NavigationLayoutConfig = {
  quickAccessHeight: number;
};

export type CreatePageResult = {
  page: PageSummary;
  pages: PageSummary[];
  folders: string[];
  diagnostics: Diagnostic[];
};

export type CreateFolderResult = {
  path: string;
  folders: string[];
};

export type DeletePageResult = {
  deletedPath: string;
  pages: PageSummary[];
  folders: string[];
  diagnostics: Diagnostic[];
};

export type DeleteFolderResult = {
  deletedPath: string;
  deletedPagePaths: string[];
  pages: PageSummary[];
  folders: string[];
  diagnostics: Diagnostic[];
};

export type MovePageResult = {
  oldPath: string;
  page: PageSummary;
  pages: PageSummary[];
  folders: string[];
  diagnostics: Diagnostic[];
  updatedLinkCount: number;
};

export type RenamePageResult = {
  oldPath: string;
  page: PageSummary;
  pages: PageSummary[];
  folders: string[];
  diagnostics: Diagnostic[];
  updatedLinkCount: number;
};

export type RenameFolderResult = {
  oldPath: string;
  newPath: string;
  pages: PageSummary[];
  folders: string[];
  diagnostics: Diagnostic[];
  renamedPageCount: number;
  updatedLinkCount: number;
};
