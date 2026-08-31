import { writable } from "svelte/store";
import {
  createFolder as createFolderCommand,
  createPage as createPageCommand,
  deleteFolder as deleteFolderCommand,
  deletePage as deletePageCommand,
  getLastWorkspace,
  listPages,
  moveFolder as moveFolderCommand,
  movePage as movePageCommand,
  openWorkspace as openWorkspaceCommand,
  renameFolder as renameFolderCommand,
  renamePage as renamePageCommand,
  saveBacklinkViewConfig as saveBacklinkViewConfigCommand,
  saveFolderColorsConfig as saveFolderColorsConfigCommand,
  saveManualPageOrderConfig as saveManualPageOrderConfigCommand,
  saveNavigationConfig as saveNavigationConfigCommand,
  saveNavigationLayoutConfig as saveNavigationLayoutConfigCommand,
  savePageSortConfig as savePageSortConfigCommand,
  saveThemeConfig as saveThemeConfigCommand,
  saveTaskOverviewConfig as saveTaskOverviewConfigCommand,
  saveWorkspaceSessionConfig,
} from "../api.js";
import { toErrorMessage } from "../errors.js";
import { DEFAULT_TASK_STATE_COLORS } from "../taskColors.js";
import { DEFAULT_TASK_STATES } from "../taskKeywords.js";
import { themeStore } from "./theme.js";
import type {
  Diagnostic,
  BacklinkViewConfig,
  FolderColors,
  ManualPageOrder,
  NavigationLayoutConfig,
  PageSortMode,
  PageSummary,
  TaskOverviewConfig,
  TaskStateColors,
  TaskStatus,
  ThemeMode,
} from "../types.js";

const DEFAULT_TASK_OVERVIEW_CONFIG: TaskOverviewConfig = {
  statusFilter: "OPEN",
  priorityFilter: "ALL",
  textFilter: "",
  groupMode: "status",
};
const DEFAULT_PAGE_SORT: PageSortMode = "name-desc";
const DEFAULT_NAVIGATION_LAYOUT: NavigationLayoutConfig = {
  quickAccessHeight: 220,
};
const DEFAULT_BACKLINK_VIEW_CONFIG: BacklinkViewConfig = {
  openTasksOnly: false,
};
const DEFAULT_THEME_MODE: ThemeMode = "light";

function configSaveError(label: string, error: unknown) {
  return `Could not save ${label} to .config: ${toErrorMessage(error)}`;
}

type WorkspaceStoreState = {
  root: string | null;
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
  loading: boolean;
  error: string | null;
};

const initialState: WorkspaceStoreState = {
  root: null,
  pages: [],
  folders: [],
  diagnostics: [],
  taskStates: DEFAULT_TASK_STATES,
  taskStateColors: DEFAULT_TASK_STATE_COLORS,
  taskDoneSoundEnabled: true,
  defaultPageSort: DEFAULT_PAGE_SORT,
  folderPageSort: {},
  manualPageOrder: {},
  folderColors: {},
  expandedFolders: null,
  pageFavorites: [],
  recentPages: [],
  navigationLayout: DEFAULT_NAVIGATION_LAYOUT,
  taskOverview: DEFAULT_TASK_OVERVIEW_CONFIG,
  backlinkView: DEFAULT_BACKLINK_VIEW_CONFIG,
  themeMode: DEFAULT_THEME_MODE,
  lastEditorPath: null,
  lastRightPanePath: null,
  loading: false,
  error: null,
};

function createWorkspaceStore() {
  const { subscribe, set, update } = writable<WorkspaceStoreState>(initialState);

  return {
    subscribe,
    clear() {
      set(initialState);
      themeStore.set(DEFAULT_THEME_MODE);
    },
    clearError() {
      update((state) => ({ ...state, error: null }));
    },
    async open(path: string) {
      const trimmed = path.trim();

      if (!trimmed) {
        update((state) => ({ ...state, error: "Enter a workspace path." }));
        return;
      }

      update((state) => ({ ...state, loading: true, error: null }));

      try {
        const workspace = await openWorkspaceCommand(trimmed);
        const themeMode = workspace.themeMode ?? DEFAULT_THEME_MODE;
        themeStore.set(themeMode);
        set({
          root: workspace.root,
          pages: workspace.pages,
          folders: workspace.folders ?? [],
          diagnostics: workspace.diagnostics,
          taskStates: workspace.taskStates.length > 0 ? workspace.taskStates : DEFAULT_TASK_STATES,
          taskStateColors:
            Object.keys(workspace.taskStateColors).length > 0
              ? workspace.taskStateColors
              : DEFAULT_TASK_STATE_COLORS,
          taskDoneSoundEnabled: workspace.taskDoneSoundEnabled ?? true,
          defaultPageSort: workspace.defaultPageSort ?? DEFAULT_PAGE_SORT,
          folderPageSort: workspace.folderPageSort ?? {},
          manualPageOrder: workspace.manualPageOrder ?? {},
          folderColors: workspace.folderColors ?? {},
          expandedFolders: workspace.expandedFolders,
          pageFavorites: workspace.pageFavorites ?? [],
          recentPages: workspace.recentPages ?? [],
          navigationLayout: workspace.navigationLayout ?? DEFAULT_NAVIGATION_LAYOUT,
          taskOverview: workspace.taskOverview ?? DEFAULT_TASK_OVERVIEW_CONFIG,
          backlinkView: workspace.backlinkView ?? DEFAULT_BACKLINK_VIEW_CONFIG,
          themeMode,
          lastEditorPath: workspace.lastEditorPath ?? null,
          lastRightPanePath: workspace.lastRightPanePath ?? null,
          loading: false,
          error: null,
        });
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          error: toErrorMessage(error),
        }));
      }
    },
    async openLastWorkspace() {
      try {
        const path = await getLastWorkspace();
        if (!path) {
          return false;
        }

        await this.open(path);
        return true;
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          error: toErrorMessage(error),
        }));
        return false;
      }
    },
    async createPage(path: string) {
      const trimmed = path.trim();

      if (!trimmed) {
        update((state) => ({ ...state, error: "Enter a page path." }));
        return null;
      }

      update((state) => ({ ...state, loading: true, error: null }));

      try {
        const result = await createPageCommand(trimmed);
        update((state) => ({
          ...state,
          pages: result.pages,
          folders: result.folders,
          diagnostics: result.diagnostics,
          loading: false,
          error: null,
        }));
        return result.page;
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          error: toErrorMessage(error),
        }));
        return null;
      }
    },
    async createFolder(path: string) {
      const trimmed = path.trim();

      if (!trimmed) {
        update((state) => ({ ...state, error: "Enter a folder path." }));
        return null;
      }

      update((state) => ({ ...state, loading: true, error: null }));

      try {
        const result = await createFolderCommand(trimmed);
        update((state) => ({
          ...state,
          folders: result.folders,
          loading: false,
          error: null,
        }));
        return result.path;
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          error: toErrorMessage(error),
        }));
        return null;
      }
    },
    async deletePage(path: string) {
      update((state) => ({ ...state, loading: true, error: null }));

      try {
        const result = await deletePageCommand(path);
        update((state) => ({
          ...state,
          pages: result.pages,
          folders: result.folders,
          pageFavorites: state.pageFavorites.filter(
            (favoritePath) => favoritePath !== result.deletedPath,
          ),
          recentPages: state.recentPages.filter((recentPath) => recentPath !== result.deletedPath),
          diagnostics: result.diagnostics,
          loading: false,
          error: null,
        }));
        return result.deletedPath;
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          error: toErrorMessage(error),
        }));
        return null;
      }
    },
    async deleteFolder(path: string) {
      update((state) => ({ ...state, loading: true, error: null }));

      try {
        const result = await deleteFolderCommand(path);
        update((state) => ({
          ...state,
          pages: result.pages,
          folders: result.folders,
          pageFavorites: state.pageFavorites.filter(
            (favoritePath) =>
              !result.deletedPagePaths.some((deletedPath) => deletedPath === favoritePath),
          ),
          recentPages: state.recentPages.filter(
            (recentPath) =>
              !result.deletedPagePaths.some((deletedPath) => deletedPath === recentPath),
          ),
          diagnostics: result.diagnostics,
          loading: false,
          error: null,
        }));
        return result;
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          error: toErrorMessage(error),
        }));
        return null;
      }
    },
    async movePage(path: string, targetFolder: string) {
      update((state) => ({ ...state, loading: true, error: null }));

      try {
        const result = await movePageCommand(path, targetFolder);
        update((state) => ({
          ...state,
          pages: result.pages,
          folders: result.folders,
          diagnostics: result.diagnostics,
          loading: false,
          error: null,
        }));
        return result;
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          error: toErrorMessage(error),
        }));
        return null;
      }
    },
    async moveFolder(path: string, targetFolder: string) {
      update((state) => ({ ...state, loading: true, error: null }));

      try {
        const result = await moveFolderCommand(path, targetFolder);
        update((state) => ({
          ...state,
          pages: result.pages,
          folders: result.folders,
          diagnostics: result.diagnostics,
          loading: false,
          error: null,
        }));
        return result;
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          error: toErrorMessage(error),
        }));
        return null;
      }
    },
    async renamePage(path: string, newName: string) {
      update((state) => ({ ...state, loading: true, error: null }));

      try {
        const result = await renamePageCommand(path, newName);
        update((state) => ({
          ...state,
          pages: result.pages,
          folders: result.folders,
          diagnostics: result.diagnostics,
          loading: false,
          error: null,
        }));
        return result;
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          error: toErrorMessage(error),
        }));
        return null;
      }
    },
    async renameFolder(path: string, newName: string) {
      update((state) => ({ ...state, loading: true, error: null }));

      try {
        const result = await renameFolderCommand(path, newName);
        update((state) => ({
          ...state,
          pages: result.pages,
          folders: result.folders,
          diagnostics: result.diagnostics,
          loading: false,
          error: null,
        }));
        return result;
      } catch (error) {
        update((state) => ({
          ...state,
          loading: false,
          error: toErrorMessage(error),
        }));
        return null;
      }
    },
    async refreshPages() {
      try {
        const pages = await listPages();
        update((state) => ({ ...state, pages, error: null }));
      } catch (error) {
        update((state) => ({
          ...state,
          error: toErrorMessage(error),
        }));
      }
    },
    async saveTaskOverviewConfig(taskOverview: TaskOverviewConfig) {
      update((state) => ({ ...state, taskOverview, error: null }));

      try {
        const saved = await saveTaskOverviewConfigCommand(taskOverview);
        update((state) => ({ ...state, taskOverview: saved, error: null }));
        return saved;
      } catch (error) {
        update((state) => ({
          ...state,
          error: configSaveError("task overview settings", error),
        }));
        return null;
      }
    },
    async saveBacklinkViewConfig(backlinkView: BacklinkViewConfig) {
      update((state) => ({ ...state, backlinkView, error: null }));

      try {
        const saved = await saveBacklinkViewConfigCommand(backlinkView);
        update((state) => ({ ...state, backlinkView: saved, error: null }));
        return saved;
      } catch (error) {
        update((state) => ({
          ...state,
          error: configSaveError("backlink view settings", error),
        }));
        return null;
      }
    },
    async saveThemeMode(themeMode: ThemeMode) {
      update((state) => ({ ...state, themeMode, error: null }));
      themeStore.set(themeMode);

      try {
        const savedThemeMode = await saveThemeConfigCommand(themeMode);
        update((state) => ({ ...state, themeMode: savedThemeMode, error: null }));
        themeStore.set(savedThemeMode);
        return savedThemeMode;
      } catch (error) {
        update((state) => {
          if (!state.root) {
            return state;
          }
          return {
            ...state,
            error: configSaveError("theme setting", error),
          };
        });
        return null;
      }
    },
    async savePageSortConfig(
      defaultPageSort: PageSortMode,
      folderPageSort: Record<string, PageSortMode>,
    ) {
      update((state) => ({ ...state, defaultPageSort, folderPageSort, error: null }));

      try {
        const [savedDefaultPageSort, savedFolderPageSort] = await savePageSortConfigCommand(
          defaultPageSort,
          folderPageSort,
        );
        update((state) => ({
          ...state,
          defaultPageSort: savedDefaultPageSort,
          folderPageSort: savedFolderPageSort,
          error: null,
        }));
        return { defaultPageSort: savedDefaultPageSort, folderPageSort: savedFolderPageSort };
      } catch (error) {
        update((state) => ({
          ...state,
          error: configSaveError("page sort settings", error),
        }));
        return null;
      }
    },
    async saveManualPageOrderConfig(manualPageOrder: ManualPageOrder) {
      update((state) => ({ ...state, manualPageOrder, error: null }));

      try {
        const savedManualPageOrder = await saveManualPageOrderConfigCommand(manualPageOrder);
        update((state) => ({
          ...state,
          manualPageOrder: savedManualPageOrder,
          error: null,
        }));
        return savedManualPageOrder;
      } catch (error) {
        update((state) => ({
          ...state,
          error: configSaveError("manual page order", error),
        }));
        return null;
      }
    },
    async saveFolderColorsConfig(folderColors: FolderColors) {
      update((state) => ({ ...state, folderColors, error: null }));

      try {
        const savedFolderColors = await saveFolderColorsConfigCommand(folderColors);
        update((state) => ({
          ...state,
          folderColors: savedFolderColors,
          error: null,
        }));
        return savedFolderColors;
      } catch (error) {
        update((state) => ({
          ...state,
          error: configSaveError("folder colors", error),
        }));
        return null;
      }
    },
    async saveWorkspaceSession(lastEditorPath: string | null, lastRightPanePath: string | null) {
      update((state) => ({ ...state, lastEditorPath, lastRightPanePath, error: null }));

      try {
        await saveWorkspaceSessionConfig(lastEditorPath, lastRightPanePath);
      } catch (error) {
        update((state) => ({
          ...state,
          error: configSaveError("workspace session", error),
        }));
      }
    },
    async saveNavigationConfig(pageFavorites: string[], recentPages: string[]) {
      update((state) => ({ ...state, pageFavorites, recentPages, error: null }));

      try {
        const [savedPageFavorites, savedRecentPages] = await saveNavigationConfigCommand(
          pageFavorites,
          recentPages,
        );
        update((state) => ({
          ...state,
          pageFavorites: savedPageFavorites,
          recentPages: savedRecentPages,
          error: null,
        }));
        return { pageFavorites: savedPageFavorites, recentPages: savedRecentPages };
      } catch (error) {
        update((state) => ({
          ...state,
          error: configSaveError("navigation settings", error),
        }));
        return null;
      }
    },
    async saveNavigationLayoutConfig(navigationLayout: NavigationLayoutConfig) {
      update((state) => ({ ...state, navigationLayout, error: null }));

      try {
        const savedNavigationLayout =
          await saveNavigationLayoutConfigCommand(navigationLayout);
        update((state) => ({
          ...state,
          navigationLayout: savedNavigationLayout,
          error: null,
        }));
        return savedNavigationLayout;
      } catch (error) {
        update((state) => ({
          ...state,
          error: configSaveError("navigation layout", error),
        }));
        return null;
      }
    },
  };
}

export const workspaceStore = createWorkspaceStore();
