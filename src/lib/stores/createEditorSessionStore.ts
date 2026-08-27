import { writable } from "svelte/store";
import {
  setCheckboxLine as setCheckboxLineInContent,
  toggleCheckboxLine as toggleCheckboxLineInContent,
} from "../checkboxes.js";
import { taskKeywordMatch, taskPriorityChange } from "../taskKeywords.js";
import type { PageContent, SavePageResult } from "../types";

export type EditorSessionState = {
  path: string | null;
  content: string;
  modifiedAt: string | null;
  contentHash: string | null;
  revealLine: number | null;
  revealToken: number;
  loading: boolean;
  saving: boolean;
  dirty: boolean;
  conflict: boolean;
  diskContent: string | null;
  canGoBack: boolean;
  canGoForward: boolean;
  error: string | null;
};

const initialState: EditorSessionState = {
  path: null,
  content: "",
  modifiedAt: null,
  contentHash: null,
  revealLine: null,
  revealToken: 0,
  loading: false,
  saving: false,
  dirty: false,
  conflict: false,
  diskContent: null,
  canGoBack: false,
  canGoForward: false,
  error: null,
};

export type EditorSessionDependencies = {
  openPage: (path: string) => Promise<PageContent>;
  savePage: (
    path: string,
    content: string,
    expectedModifiedAt: string,
    expectedContentHash: string,
  ) => Promise<SavePageResult>;
  refreshPages?: () => Promise<void>;
  refreshRightPane: () => Promise<void>;
  autoSaveDelayMs: number;
};

export type OpenEditorOptions = {
  forceReload?: boolean;
  line?: number;
  recordHistory?: boolean;
};

export function createEditorSessionStore(dependencies: EditorSessionDependencies) {
  const { subscribe, set, update } = writable<EditorSessionState>(initialState);
  let currentState = initialState;
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingSave = false;
  let openSequence = 0;
  let backStack: string[] = [];
  let forwardStack: string[] = [];

  subscribe((state) => {
    currentState = state;
  });

  function clearSaveTimer() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
  }

  function scheduleAutoSave(save: () => Promise<void>) {
    clearSaveTimer();
    saveTimer = setTimeout(() => {
      void save();
    }, dependencies.autoSaveDelayMs);
  }

  async function open(path: string, options: OpenEditorOptions = {}) {
    if (currentState.path === path && !options.forceReload) {
      update((state) => ({
        ...state,
        revealLine: options.line ?? state.revealLine,
        revealToken: options.line ? state.revealToken + 1 : state.revealToken,
        error: null,
      }));
      return;
    }

    if (currentState.saving) {
      update((state) => ({
        ...state,
        error: "Wait for the current save to finish before opening another page.",
      }));
      return;
    }

    if (currentState.conflict) {
      update((state) => ({
        ...state,
        error: "Resolve the current file conflict before opening another page.",
      }));
      return;
    }

    if (currentState.dirty) {
      await save();

      if (currentState.dirty || currentState.conflict || currentState.error) {
        return;
      }
    }

    clearSaveTimer();
    pendingSave = false;
    const requestId = ++openSequence;
    const previousPath = currentState.path;
    update((state) => ({ ...state, loading: true, error: null }));

    try {
      const page = await dependencies.openPage(path);
      if (requestId !== openSequence) {
        return;
      }
      if (options.recordHistory !== false && previousPath && previousPath !== page.path) {
        backStack = [...backStack, previousPath];
        forwardStack = [];
      }
      set({
        path: page.path,
        content: page.content,
        modifiedAt: page.modifiedAt,
        contentHash: page.contentHash,
        revealLine: options.line ?? null,
        revealToken: options.line ? currentState.revealToken + 1 : currentState.revealToken,
        loading: false,
        saving: false,
        dirty: false,
        conflict: false,
        diskContent: null,
        canGoBack: backStack.length > 0,
        canGoForward: forwardStack.length > 0,
        error: null,
      });
    } catch (error) {
      if (requestId !== openSequence) {
        return;
      }
      update((state) => ({
        ...state,
        loading: false,
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }

  async function save(contentOverride?: string) {
    if (contentOverride !== undefined) {
      update((value) => ({
        ...value,
        content: contentOverride,
        dirty: value.dirty || contentOverride !== value.content,
      }));
    }

    const state =
      contentOverride === undefined
        ? currentState
        : {
            ...currentState,
            content: contentOverride,
            dirty: currentState.dirty || contentOverride !== currentState.content,
          };

    if (state.saving) {
      pendingSave = true;
      return;
    }

    clearSaveTimer();

    if (
      !state.path ||
      !state.dirty ||
      state.loading ||
      state.conflict ||
      !state.modifiedAt ||
      !state.contentHash
    ) {
      return;
    }

    const savePath = state.path;
    const savedContent = state.content;
    update((value) => ({ ...value, saving: true, error: null }));

    try {
      const result = await dependencies.savePage(
        savePath,
        savedContent,
        state.modifiedAt,
        state.contentHash,
      );

      if (result.status === "saved") {
        const savedPage = await dependencies.openPage(result.path);
        let needsFollowUpSave = false;

        update((value) => {
          if (value.path !== savePath) {
            return value;
          }

          const changedSinceSave = value.content !== savedContent;
          needsFollowUpSave = changedSinceSave || pendingSave;

          return {
            ...value,
            path: savedPage.path,
            content: changedSinceSave ? value.content : savedPage.content,
            modifiedAt: savedPage.modifiedAt,
            contentHash: savedPage.contentHash,
            revealLine: value.revealLine,
            revealToken: value.revealToken,
            saving: false,
            dirty: changedSinceSave,
            error: null,
          };
        });

        pendingSave = false;

        if (needsFollowUpSave) {
          scheduleAutoSave(() => save());
        }

        await dependencies.refreshPages?.();
        await dependencies.refreshRightPane();
        return;
      }

      update((value) => {
        if (value.path !== savePath) {
          return value;
        }

        return {
          ...value,
          modifiedAt: result.currentModifiedAt,
          contentHash: result.currentContentHash,
          saving: false,
          conflict: true,
          diskContent: result.diskContent,
          error: "File changed on disk. Reload from disk or overwrite disk.",
        };
      });
      pendingSave = false;
    } catch (error) {
      update((value) => {
        if (value.path !== savePath) {
          return value;
        }

        return {
          ...value,
          saving: false,
          error: error instanceof Error ? error.message : String(error),
        };
      });
      pendingSave = false;
    }
  }

  async function reloadFromDisk() {
    if (!currentState.path) {
      return;
    }
    await open(currentState.path, { forceReload: true });
  }

  async function goBack() {
    const targetPath = backStack.at(-1);
    const previousPath = currentState.path;
    if (!targetPath || !previousPath) {
      return;
    }

    await open(targetPath, { recordHistory: false });
    if (currentState.path !== targetPath) {
      return;
    }

    backStack = backStack.slice(0, -1);
    forwardStack = [...forwardStack, previousPath];
    syncHistoryFlags();
  }

  async function goForward() {
    const targetPath = forwardStack.at(-1);
    const previousPath = currentState.path;
    if (!targetPath || !previousPath) {
      return;
    }

    await open(targetPath, { recordHistory: false });
    if (currentState.path !== targetPath) {
      return;
    }

    forwardStack = forwardStack.slice(0, -1);
    backStack = [...backStack, previousPath];
    syncHistoryFlags();
  }

  function syncHistoryFlags() {
    update((state) => ({
      ...state,
      canGoBack: backStack.length > 0,
      canGoForward: forwardStack.length > 0,
    }));
  }

  async function overwriteDisk() {
    if (!currentState.path) {
      return;
    }

    update((value) => ({
      ...value,
      conflict: false,
      diskContent: null,
      dirty: true,
    }));
    await save();
  }

  return {
    subscribe,
    open,
    goBack,
    goForward,
    clearError() {
      update((state) => ({ ...state, error: null }));
    },
    setContent(content: string) {
      update((state) => {
        if (!state.path || state.conflict) {
          return { ...state, content };
        }

        return { ...state, content, dirty: true, error: null };
      });
      scheduleAutoSave(save);
    },
    toggleCheckboxLine(line: number) {
      const result = toggleCheckboxLineInContent(currentState.content, line);
      if (!result.changed) {
        return false;
      }

      update((state) => ({
        ...state,
        content: result.content,
        dirty: true,
        error: null,
      }));
      scheduleAutoSave(save);
      return true;
    },
    setCheckboxLine(line: number, checked: boolean) {
      const result = setCheckboxLineInContent(currentState.content, line, checked);
      if (!result.changed) {
        return result.checked === checked;
      }

      update((state) => ({
        ...state,
        content: result.content,
        dirty: true,
        error: null,
      }));
      scheduleAutoSave(save);
      return true;
    },
    setTaskStatusLine(
      line: number,
      currentStatus: string,
      nextStatus: string,
      taskStates: string[],
    ) {
      const lineRange = lineContentRange(currentState.content, line);
      if (!lineRange) {
        return false;
      }

      const lineText = currentState.content.slice(lineRange.start, lineRange.end);
      const match = taskKeywordMatch(lineText, 0, taskStates);
      if (!match || match.status !== currentStatus) {
        return false;
      }

      const content = replaceContentRange(
        currentState.content,
        lineRange.start + match.from,
        lineRange.start + match.to,
        nextStatus,
      );
      update((state) => ({
        ...state,
        content,
        dirty: true,
        error: null,
      }));
      scheduleAutoSave(save);
      return true;
    },
    setTaskPriorityLine(line: number, priority: string | null, taskStates: string[]) {
      const lineRange = lineContentRange(currentState.content, line);
      if (!lineRange) {
        return false;
      }

      const lineText = currentState.content.slice(lineRange.start, lineRange.end);
      const change = taskPriorityChange(lineText, 0, priority, taskStates);
      if (!change) {
        return false;
      }

      const content = replaceContentRange(
        currentState.content,
        lineRange.start + change.from,
        lineRange.start + change.to,
        change.insert,
      );
      update((state) => ({
        ...state,
        content,
        dirty: true,
        error: null,
      }));
      scheduleAutoSave(save);
      return true;
    },
    save,
    clear() {
      clearSaveTimer();
      pendingSave = false;
      openSequence += 1;
      backStack = [];
      forwardStack = [];
      set(initialState);
    },
    clearIfPath(path: string) {
      if (currentState.path !== path) {
        return;
      }

      clearSaveTimer();
      pendingSave = false;
      backStack = [];
      forwardStack = [];
      set(initialState);
    },
    reloadFromDisk,
    overwriteDisk,
  };
}

function replaceContentRange(content: string, from: number, to: number, insert: string) {
  return `${content.slice(0, from)}${insert}${content.slice(to)}`;
}

function lineContentRange(content: string, targetLine: number) {
  if (targetLine <= 0) {
    return null;
  }

  let currentLine = 1;
  let lineStart = 0;

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== "\n") {
      continue;
    }

    if (currentLine === targetLine) {
      const lineEnd = index > lineStart && content[index - 1] === "\r" ? index - 1 : index;
      return { start: lineStart, end: lineEnd };
    }

    currentLine += 1;
    lineStart = index + 1;
  }

  return currentLine === targetLine ? { start: lineStart, end: content.length } : null;
}
