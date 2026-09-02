import { get, writable } from "svelte/store";
import { getPageView, toggleCheckbox, updateTaskPriority, updateTaskStatus } from "../api.js";
import { toErrorMessage } from "../errors.js";
import { parseCheckboxListItem } from "../markdownPatterns.js";
import { priorityCookieMatch, taskKeywordMatch } from "../taskKeywords.js";
import { editorSessionStore } from "./editorSession.js";
import { rightPaneStore } from "./rightPane.js";
import { taskStore } from "./tasks.js";
import { workspaceStore } from "./workspace.js";

type EditorChangeOperation = {
  kind: "editor-change";
  path: string;
};

export type TaskStatusOperation = {
  kind: "task-status";
  path: string;
  line: number;
  beforeStatus: string;
  afterStatus: string;
};

export type TaskPriorityOperation = {
  kind: "task-priority";
  path: string;
  line: number;
  beforePriority: string | null;
  afterPriority: string | null;
};

export type CheckboxOperation = {
  kind: "checkbox";
  path: string;
  line: number;
  beforeChecked: boolean;
  afterChecked: boolean;
};

type AppUndoOperation =
  | EditorChangeOperation
  | TaskStatusOperation
  | TaskPriorityOperation
  | CheckboxOperation;

export type AppUndoMutationOperation =
  | TaskStatusOperation
  | TaskPriorityOperation
  | CheckboxOperation;

type AppUndoState = {
  undoStack: AppUndoOperation[];
  redoStack: AppUndoOperation[];
  nextUndoLabel: string | null;
  nextRedoLabel: string | null;
  running: boolean;
  error: string | null;
};

type UndoEditorState = {
  path: string | null;
  content: string;
  dirty: boolean;
  saving: boolean;
  conflict: boolean;
  error: string | null;
};

export type AppUndoDependencies = {
  getEditorState: () => UndoEditorState;
  getTaskStates: () => string[];
  requestEditorHistoryChange: (direction: "undo" | "redo") => Promise<boolean>;
  isolateEditorHistory: () => void;
  setEditorCheckboxLine: (line: number, checked: boolean) => boolean;
  setEditorTaskStatusLine: (
    line: number,
    currentStatus: string,
    nextStatus: string,
    taskStates: string[],
  ) => boolean;
  setEditorTaskPriorityLine: (
    line: number,
    priority: string | null,
    taskStates: string[],
  ) => boolean;
  saveEditor: () => Promise<boolean>;
  getPageView: typeof getPageView;
  toggleCheckbox: typeof toggleCheckbox;
  updateTaskStatus: typeof updateTaskStatus;
  updateTaskPriority: typeof updateTaskPriority;
  refreshTasks: () => Promise<void>;
  refreshRightPane: () => Promise<void>;
};

const initialState: AppUndoState = {
  undoStack: [],
  redoStack: [],
  nextUndoLabel: null,
  nextRedoLabel: null,
  running: false,
  error: null,
};

const maxUndoActions = 50;

const defaultDependencies: AppUndoDependencies = {
  getEditorState: () => get(editorSessionStore),
  getTaskStates: () => get(workspaceStore).taskStates,
  requestEditorHistoryChange,
  isolateEditorHistory: () => {
    window.dispatchEvent(new CustomEvent("mentinote-editor-isolate-history"));
  },
  setEditorCheckboxLine: (line, checked) => editorSessionStore.setCheckboxLine(line, checked),
  setEditorTaskStatusLine: (line, currentStatus, nextStatus, taskStates) =>
    editorSessionStore.setTaskStatusLine(line, currentStatus, nextStatus, taskStates),
  setEditorTaskPriorityLine: (line, priority, taskStates) =>
    editorSessionStore.setTaskPriorityLine(line, priority, taskStates),
  saveEditor: () => editorSessionStore.save(),
  getPageView,
  toggleCheckbox,
  updateTaskStatus,
  updateTaskPriority,
  refreshTasks: () => taskStore.refresh(),
  refreshRightPane: () => rightPaneStore.refresh(),
};

export function createAppUndoStore(dependencies: AppUndoDependencies = defaultDependencies) {
  const { subscribe, set, update } = writable<AppUndoState>(initialState);

  return {
    subscribe,
    clear() {
      set(initialState);
    },
    push(operation: AppUndoMutationOperation) {
      update((state) =>
        withLabels({
          ...state,
          undoStack: [...state.undoStack, operation].slice(-maxUndoActions),
          redoStack: [],
          error: null,
        }),
      );
    },
    recordEditorChange(path: string | null) {
      if (!path) {
        return;
      }

      const operation: EditorChangeOperation = { kind: "editor-change", path };
      update((state) =>
        withLabels({
          ...state,
          undoStack: [...state.undoStack, operation].slice(-maxUndoActions),
          redoStack: [],
          error: null,
        }),
      );
    },
    discardEditorHistory(path: string | null) {
      update((state) =>
        withLabels({
          ...state,
          undoStack: state.undoStack.filter(
            (operation) => operation.kind !== "editor-change" || operation.path !== path,
          ),
          redoStack: state.redoStack.filter(
            (operation) => operation.kind !== "editor-change" || operation.path !== path,
          ),
          error: null,
        }),
      );
    },
    async undoLast() {
      return applyLast("undo", { subscribe, update }, dependencies);
    },
    async redoLast() {
      return applyLast("redo", { subscribe, update }, dependencies);
    },
  };
}

async function applyLast(
  direction: "undo" | "redo",
  store: {
    subscribe: (run: (value: AppUndoState) => void) => () => void;
    update: (updater: (value: AppUndoState) => AppUndoState) => void;
  },
  dependencies: AppUndoDependencies,
) {
  const state = get({ subscribe: store.subscribe });
  const sourceStack = direction === "undo" ? state.undoStack : state.redoStack;
  const operation = sourceStack.at(-1) ?? null;
  if (!operation || state.running) {
    return false;
  }

  store.update((current) => withLabels({ ...current, running: true, error: null }));

  try {
    await applyOperation(operation, direction, dependencies);
    store.update((current) => {
      const undoStack =
        direction === "undo"
          ? current.undoStack.slice(0, -1)
          : [...current.undoStack, operation].slice(-maxUndoActions);
      const redoStack =
        direction === "undo"
          ? [...current.redoStack, operation].slice(-maxUndoActions)
          : current.redoStack.slice(0, -1);

      return withLabels({
        ...current,
        undoStack,
        redoStack,
        running: false,
        error: null,
      });
    });
    return true;
  } catch (error) {
    store.update((current) =>
      withLabels({
        ...current,
        running: false,
        error: toErrorMessage(error),
      }),
    );
    return false;
  }
}

function withLabels(state: AppUndoState): AppUndoState {
  return {
    ...state,
    nextUndoLabel: actionLabel(state.undoStack.at(-1) ?? null, "undo"),
    nextRedoLabel: actionLabel(state.redoStack.at(-1) ?? null, "redo"),
  };
}

function actionLabel(operation: AppUndoOperation | null, direction: "undo" | "redo") {
  if (!operation) {
    return null;
  }

  if (operation.kind === "editor-change") {
    return "Edit";
  }

  if (operation.kind === "checkbox") {
    const targetChecked = direction === "undo" ? operation.beforeChecked : operation.afterChecked;
    return targetChecked ? "Check" : "Uncheck";
  }

  if (operation.kind === "task-status") {
    return "Change Task State";
  }

  return "Change Task Priority";
}

async function applyOperation(
  operation: AppUndoOperation,
  direction: "undo" | "redo",
  dependencies: AppUndoDependencies,
) {
  if (operation.kind === "editor-change") {
    await applyEditorOperation(operation, direction, dependencies);
    return;
  }

  const editor = dependencies.getEditorState();
  if (editor.path === operation.path && (editor.saving || editor.conflict)) {
    throw new Error(
      "Wait for the current save or resolve the editor conflict before undoing this change.",
    );
  }

  dependencies.isolateEditorHistory();
  try {
    if (operation.kind === "checkbox") {
      await applyCheckboxOperation(operation, direction, dependencies);
      return;
    }

    if (operation.kind === "task-status") {
      await applyTaskStatusOperation(operation, direction, dependencies);
      return;
    }

    await applyTaskPriorityOperation(operation, direction, dependencies);
  } finally {
    dependencies.isolateEditorHistory();
  }
}

async function applyEditorOperation(
  operation: EditorChangeOperation,
  direction: "undo" | "redo",
  dependencies: AppUndoDependencies,
) {
  const editor = dependencies.getEditorState();
  if (editor.path !== operation.path) {
    throw new Error("Editor undo history for this file is no longer available.");
  }

  const changed = await dependencies.requestEditorHistoryChange(direction);
  if (!changed) {
    throw new Error(`No editor ${direction} is available for this file.`);
  }
}

function requestEditorHistoryChange(direction: "undo" | "redo") {
  return new Promise<boolean>((resolve) => {
    let responded = false;
    window.dispatchEvent(
      new CustomEvent(direction === "undo" ? "mentinote-editor-undo" : "mentinote-editor-redo", {
        detail: {
          respond(changed: boolean) {
            responded = true;
            resolve(changed);
          },
        },
      }),
    );

    queueMicrotask(() => {
      if (!responded) {
        resolve(false);
      }
    });
  });
}

async function applyCheckboxOperation(
  operation: CheckboxOperation,
  direction: "undo" | "redo",
  dependencies: AppUndoDependencies,
) {
  const targetChecked = direction === "undo" ? operation.beforeChecked : operation.afterChecked;
  const editor = dependencies.getEditorState();

  if (editor.path === operation.path) {
    const changed = dependencies.setEditorCheckboxLine(operation.line, targetChecked);
    if (!changed) {
      throw new Error(`Line ${operation.line} is not a recognized checkbox item.`);
    }
    await saveEditorOrThrow(dependencies);
    await refreshDerivedViews(dependencies);
    return;
  }

  const currentChecked = await checkboxStateFromDisk(
    operation.path,
    operation.line,
    dependencies,
  );
  if (currentChecked === targetChecked) {
    await refreshDerivedViews(dependencies);
    return;
  }

  await dependencies.toggleCheckbox(operation.path, operation.line);
  await refreshDerivedViews(dependencies);
}

async function applyTaskStatusOperation(
  operation: TaskStatusOperation,
  direction: "undo" | "redo",
  dependencies: AppUndoDependencies,
) {
  const taskStates = dependencies.getTaskStates();
  const editor = dependencies.getEditorState();
  const fromStatus = direction === "undo" ? operation.afterStatus : operation.beforeStatus;
  const toStatus = direction === "undo" ? operation.beforeStatus : operation.afterStatus;

  if (editor.path === operation.path) {
    const changed = dependencies.setEditorTaskStatusLine(
      operation.line,
      fromStatus,
      toStatus,
      taskStates,
    );
    if (!changed) {
      throw new Error(`Line ${operation.line} is not a recognized task. Refresh tasks.`);
    }
    await saveEditorOrThrow(dependencies);
    await refreshDerivedViews(dependencies);
    return;
  }

  const currentStatus = await taskStatusFromDisk(
    operation.path,
    operation.line,
    taskStates,
    dependencies,
  );
  if (currentStatus !== fromStatus) {
    throw new Error(`Task line ${operation.line} changed from '${fromStatus}' to '${currentStatus}'.`);
  }

  await dependencies.updateTaskStatus(operation.path, operation.line, fromStatus, toStatus);
  await refreshDerivedViews(dependencies);
}

async function applyTaskPriorityOperation(
  operation: TaskPriorityOperation,
  direction: "undo" | "redo",
  dependencies: AppUndoDependencies,
) {
  const taskStates = dependencies.getTaskStates();
  const editor = dependencies.getEditorState();
  const fromPriority = direction === "undo" ? operation.afterPriority : operation.beforePriority;
  const toPriority = direction === "undo" ? operation.beforePriority : operation.afterPriority;

  if (editor.path === operation.path) {
    const currentPriority = taskPriorityFromContent(
      editor.content,
      operation.line,
      taskStates,
    );
    if (currentPriority !== fromPriority) {
      throw new Error(`Task priority on line ${operation.line} changed. Refresh tasks.`);
    }

    const changed = dependencies.setEditorTaskPriorityLine(
      operation.line,
      toPriority,
      taskStates,
    );
    if (!changed) {
      throw new Error(`Line ${operation.line} is not a recognized task. Refresh tasks.`);
    }
    await saveEditorOrThrow(dependencies);
    await refreshDerivedViews(dependencies);
    return;
  }

  const currentPriority = await taskPriorityFromDisk(
    operation.path,
    operation.line,
    taskStates,
    dependencies,
  );
  if (currentPriority !== fromPriority) {
    throw new Error(`Task priority on line ${operation.line} changed. Refresh tasks.`);
  }

  await dependencies.updateTaskPriority(operation.path, operation.line, toPriority);
  await refreshDerivedViews(dependencies);
}

async function saveEditorOrThrow(dependencies: AppUndoDependencies) {
  const saved = await dependencies.saveEditor();
  if (!saved) {
    throw new Error(dependencies.getEditorState().error ?? "Could not save the editor page.");
  }
}

async function refreshDerivedViews(dependencies: AppUndoDependencies) {
  await dependencies.refreshTasks();
  await dependencies.refreshRightPane();
}

async function checkboxStateFromDisk(
  path: string,
  line: number,
  dependencies: AppUndoDependencies,
) {
  const page = await dependencies.getPageView(path);
  const lineText = page.content.split(/\r?\n/)[line - 1] ?? "";
  const parsed = parseCheckboxListItem(lineText);
  if (!parsed) {
    throw new Error(`Line ${line} is not a recognized checkbox item.`);
  }
  return parsed.checkbox.checked;
}

async function taskStatusFromDisk(
  path: string,
  line: number,
  taskStates: string[],
  dependencies: AppUndoDependencies,
) {
  const page = await dependencies.getPageView(path);
  const lineText = page.content.split(/\r?\n/)[line - 1] ?? "";
  const match = taskKeywordMatch(lineText, 0, taskStates);
  if (!match) {
    throw new Error(`Line ${line} is not a recognized task.`);
  }
  return match.status;
}

async function taskPriorityFromDisk(
  path: string,
  line: number,
  taskStates: string[],
  dependencies: AppUndoDependencies,
) {
  const page = await dependencies.getPageView(path);
  return taskPriorityFromContent(page.content, line, taskStates);
}

function taskPriorityFromContent(content: string, line: number, taskStates: string[]) {
  const lineText = content.split(/\r?\n/)[line - 1] ?? "";
  return priorityCookieMatch(lineText, 0, taskStates)?.priority ?? null;
}

export const appUndoStore = createAppUndoStore();
