import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  CreatePageResult,
  CreateFolderResult,
  DeleteFolderResult,
  DeletePageResult,
  MovePageResult,
  PageContent,
  PageSummary,
  PageView,
  RenameFolderResult,
  RenamePageResult,
  SavePageResult,
  SearchResult,
  PageSortMode,
  BacklinkViewConfig,
  FolderColors,
  ManualPageOrder,
  NavigationLayoutConfig,
  TaskItem,
  TaskOverviewConfig,
  TaskStatus,
  ThemeMode,
  ToggleCheckboxResult,
  UpdateTaskStatusResult,
  WorkspaceState,
} from "./types";

const TAURI_REQUIRED_MESSAGE =
  "Workspace access is only available in the Tauri desktop app. Start it with `npm run tauri dev`.";

function invokeTauri<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriRuntime()) {
    return Promise.reject(new Error(TAURI_REQUIRED_MESSAGE));
  }

  return invoke<T>(command, args);
}

export function isTauriRuntime() {
  return "__TAURI_INTERNALS__" in window;
}

export function onCoreEvent(
  event: string,
  handler: () => void | Promise<void>,
): Promise<UnlistenFn | null> {
  if (!isTauriRuntime()) {
    return Promise.resolve(null);
  }

  return listen(event, handler);
}

export async function setWindowTitle(title: string): Promise<void> {
  document.title = title;

  if (!isTauriRuntime()) {
    return;
  }

  await getCurrentWindow().setTitle(title);
}

export function updateEditMenuLabels(
  undoLabel: string | null,
  redoLabel: string | null,
  undoEnabled: boolean,
  redoEnabled: boolean,
): Promise<void> {
  return invokeTauri<void>("update_edit_menu_labels", {
    undoLabel,
    redoLabel,
    undoEnabled,
    redoEnabled,
  });
}

export function openWorkspace(path: string): Promise<WorkspaceState> {
  return invokeTauri<WorkspaceState>("open_workspace", { path });
}

export function getLastWorkspace(): Promise<string | null> {
  return invokeTauri<string | null>("get_last_workspace");
}

export function closeWorkspace(): Promise<void> {
  return invokeTauri<void>("close_workspace");
}

export function saveExpandedFolders(expandedFolders: string[]): Promise<void> {
  return invokeTauri<void>("save_expanded_folders", { expandedFolders });
}

export function saveTaskOverviewConfig(
  taskOverview: TaskOverviewConfig,
): Promise<TaskOverviewConfig> {
  return invokeTauri<TaskOverviewConfig>("save_task_overview_config", { taskOverview });
}

export function saveBacklinkViewConfig(
  backlinkView: BacklinkViewConfig,
): Promise<BacklinkViewConfig> {
  return invokeTauri<BacklinkViewConfig>("save_backlink_view_config", { backlinkView });
}

export function saveThemeConfig(themeMode: ThemeMode): Promise<ThemeMode> {
  return invokeTauri<ThemeMode>("save_theme_config", { themeMode });
}

export function savePageSortConfig(
  defaultPageSort: PageSortMode,
  folderPageSort: Record<string, PageSortMode>,
): Promise<[PageSortMode, Record<string, PageSortMode>]> {
  return invokeTauri<[PageSortMode, Record<string, PageSortMode>]>("save_page_sort_config", {
    defaultPageSort,
    folderPageSort,
  });
}

export function saveFolderColorsConfig(folderColors: FolderColors): Promise<FolderColors> {
  return invokeTauri<FolderColors>("save_folder_colors_config", { folderColors });
}

export function saveManualPageOrderConfig(
  manualPageOrder: ManualPageOrder,
): Promise<ManualPageOrder> {
  return invokeTauri<ManualPageOrder>("save_manual_page_order_config", { manualPageOrder });
}

export function saveWorkspaceSessionConfig(
  lastEditorPath: string | null,
  lastRightPanePath: string | null,
): Promise<void> {
  return invokeTauri<void>("save_workspace_session_config", {
    lastEditorPath,
    lastRightPanePath,
  });
}

export function saveNavigationConfig(
  pageFavorites: string[],
  recentPages: string[],
): Promise<[string[], string[]]> {
  return invokeTauri<[string[], string[]]>("save_navigation_config", {
    pageFavorites,
    recentPages,
  });
}

export function saveNavigationLayoutConfig(
  navigationLayout: NavigationLayoutConfig,
): Promise<NavigationLayoutConfig> {
  return invokeTauri<NavigationLayoutConfig>("save_navigation_layout_config", {
    navigationLayout,
  });
}

export function listPages(): Promise<PageSummary[]> {
  return invokeTauri<PageSummary[]>("list_pages");
}

export function createPage(path: string): Promise<CreatePageResult> {
  return invokeTauri<CreatePageResult>("create_page", { path });
}

export function createFolder(path: string): Promise<CreateFolderResult> {
  return invokeTauri<CreateFolderResult>("create_folder", { path });
}

export function deletePage(path: string): Promise<DeletePageResult> {
  return invokeTauri<DeletePageResult>("delete_page", { path });
}

export function deleteFolder(path: string): Promise<DeleteFolderResult> {
  return invokeTauri<DeleteFolderResult>("delete_folder", { path });
}

export function movePage(path: string, targetFolder: string): Promise<MovePageResult> {
  return invokeTauri<MovePageResult>("move_page", { path, targetFolder });
}

export function moveFolder(path: string, targetFolder: string): Promise<RenameFolderResult> {
  return invokeTauri<RenameFolderResult>("move_folder", { path, targetFolder });
}

export function renamePage(path: string, newName: string): Promise<RenamePageResult> {
  return invokeTauri<RenamePageResult>("rename_page", { path, newName });
}

export function renameFolder(path: string, newName: string): Promise<RenameFolderResult> {
  return invokeTauri<RenameFolderResult>("rename_folder", { path, newName });
}

export function openPage(path: string): Promise<PageContent> {
  return invokeTauri<PageContent>("open_page", { path });
}

export function savePage(
  path: string,
  content: string,
  expectedModifiedAt: string,
  expectedContentHash: string,
): Promise<SavePageResult> {
  return invokeTauri<SavePageResult>("save_page", {
    path,
    content,
    expectedModifiedAt,
    expectedContentHash,
  });
}

export function getPageView(path: string): Promise<PageView> {
  return invokeTauri<PageView>("get_page_view", { path });
}

export function searchPages(query: string): Promise<SearchResult[]> {
  return invokeTauri<SearchResult[]>("search_pages", { query });
}

export function listTasks(): Promise<TaskItem[]> {
  return invokeTauri<TaskItem[]>("list_tasks");
}

export function updateTaskStatus(
  path: string,
  line: number,
  expectedStatus: TaskStatus,
  newStatus: TaskStatus,
): Promise<UpdateTaskStatusResult> {
  return invokeTauri<UpdateTaskStatusResult>("update_task_status", {
    path,
    line,
    expectedStatus,
    newStatus,
  });
}

export function updateTaskPriority(
  path: string,
  line: number,
  priority: string | null,
): Promise<UpdateTaskStatusResult> {
  return invokeTauri<UpdateTaskStatusResult>("update_task_priority", {
    path,
    line,
    priority,
  });
}

export function toggleCheckbox(path: string, line: number): Promise<ToggleCheckboxResult> {
  return invokeTauri<ToggleCheckboxResult>("toggle_checkbox", { path, line });
}
