import { get, writable } from "svelte/store";
import { getPageView, toggleCheckbox, updateTaskPriority, updateTaskStatus } from "../api";
import { toErrorMessage } from "../errors";
import { parseCheckboxListItem } from "../markdownPatterns";
import { priorityCookieMatch, taskKeywordMatch } from "../taskKeywords";
import { editorSessionStore } from "./editorSession";
import { rightPaneStore } from "./rightPane";
import { taskStore } from "./tasks";
import { workspaceStore } from "./workspace";

type EditorChangeOperation = {
  kind: "editor-change";
  path: string;
  updatedAt: number;
};

type TaskStatusOperation = {
  kind: "task-status";
  path: string;
  line: number;
  beforeStatus: string;
  afterStatus: string;
};

type TaskPriorityOperation = {
  kind: "task-priority";
  path: string;
  line: number;
  beforePriority: string | null;
  afterPriority: string | null;
};

type CheckboxOperation = {
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

type AppUndoState = {
  undoStack: AppUndoOperation[];
  redoStack: AppUndoOperation[];
  nextUndoLabel: string | null;
  nextRedoLabel: string | null;
  running: boolean;
  error: string | null;
};

const initialState: AppUndoState = {
  undoStack: [],
  redoStack: [],
  nextUndoLabel: null,
  nextRedoLabel: null,
  running: false,
  error: null,
};

const editorChangeGroupMs = 500;
const maxUndoActions = 50;

function createAppUndoStore() {
  const { subscribe, set, update } = writable<AppUndoState>(initialState);

  return {
    subscribe,
    clear() {
      set(initialState);
    },
    push(operation: Exclude<AppUndoOperation, EditorChangeOperation>) {
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

      const now = Date.now();
      update((state) => {
        const last = state.undoStack.at(-1);
        if (
          last?.kind === "editor-change" &&
          last.path === path &&
          now - last.updatedAt <= editorChangeGroupMs
        ) {
          return withLabels({
            ...state,
            undoStack: [...state.undoStack.slice(0, -1), { ...last, updatedAt: now }],
            redoStack: [],
            error: null,
          });
        }

        const operation: EditorChangeOperation = { kind: "editor-change", path, updatedAt: now };
        return withLabels({
          ...state,
          undoStack: [...state.undoStack, operation].slice(-maxUndoActions),
          redoStack: [],
          error: null,
        });
      });
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
      return applyLast("undo", { subscribe, update });
    },
    async redoLast() {
      return applyLast("redo", { subscribe, update });
    },
  };
}

async function applyLast(
  direction: "undo" | "redo",
  store: {
    subscribe: (run: (value: AppUndoState) => void) => () => void;
    update: (updater: (value: AppUndoState) => AppUndoState) => void;
  },
) {
  const state = get({ subscribe: store.subscribe });
  const sourceStack = direction === "undo" ? state.undoStack : state.redoStack;
  const operation = sourceStack.at(-1) ?? null;
  if (!operation || state.running) {
    return false;
  }

  store.update((current) => withLabels({ ...current, running: true, error: null }));

  try {
    await applyOperation(operation, direction);
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

async function applyOperation(operation: AppUndoOperation, direction: "undo" | "redo") {
  if (operation.kind === "editor-change") {
    await applyEditorOperation(operation, direction);
    return;
  }

  const editor = get(editorSessionStore);
  if (
    editor.path === operation.path &&
    (editor.dirty || editor.saving || editor.conflict) &&
    operation.kind !== "checkbox" &&
    operation.kind !== "task-status" &&
    operation.kind !== "task-priority"
  ) {
    throw new Error("Save or resolve the current editor page before undoing this change.");
  }

  if (operation.kind === "checkbox") {
    await applyCheckboxOperation(operation, direction);
    return;
  }

  if (operation.kind === "task-status") {
    await applyTaskStatusOperation(operation, direction);
    return;
  }

  await applyTaskPriorityOperation(operation, direction);
}

async function applyEditorOperation(
  operation: EditorChangeOperation,
  direction: "undo" | "redo",
) {
  const editor = get(editorSessionStore);
  if (editor.path !== operation.path) {
    throw new Error("Editor undo history for this file is no longer available.");
  }

  const changed = await requestEditorHistoryChange(direction);
  if (!changed) {
    throw new Error(`No editor ${direction} is available for this file.`);
  }
}

function requestEditorHistoryChange(direction: "undo" | "redo") {
  return new Promise<boolean>((resolve) => {
    let responded = false;
    window.dispatchEvent(
      new CustomEvent(direction === "undo" ? "semtags-editor-undo" : "semtags-editor-redo", {
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

async function applyCheckboxOperation(operation: CheckboxOperation, direction: "undo" | "redo") {
  const targetChecked = direction === "undo" ? operation.beforeChecked : operation.afterChecked;
  const editor = get(editorSessionStore);

  if (editor.path === operation.path) {
    const changed = editorSessionStore.setCheckboxLine(operation.line, targetChecked);
    if (!changed) {
      throw new Error(`Line ${operation.line} is not a recognized checkbox item.`);
    }
    await editorSessionStore.save();
    await refreshDerivedViews();
    return;
  }

  const currentChecked = await checkboxStateFromDisk(operation.path, operation.line);
  if (currentChecked === targetChecked) {
    await refreshDerivedViews();
    return;
  }

  await toggleCheckbox(operation.path, operation.line);
  await refreshDerivedViews();
}

async function applyTaskStatusOperation(
  operation: TaskStatusOperation,
  direction: "undo" | "redo",
) {
  const workspace = get(workspaceStore);
  const editor = get(editorSessionStore);
  const fromStatus = direction === "undo" ? operation.afterStatus : operation.beforeStatus;
  const toStatus = direction === "undo" ? operation.beforeStatus : operation.afterStatus;

  if (editor.path === operation.path) {
    const changed = editorSessionStore.setTaskStatusLine(
      operation.line,
      fromStatus,
      toStatus,
      workspace.taskStates,
    );
    if (!changed) {
      throw new Error(`Line ${operation.line} is not a recognized task. Refresh tasks.`);
    }
    await editorSessionStore.save();
    await refreshDerivedViews();
    return;
  }

  const currentStatus = await taskStatusFromDisk(operation.path, operation.line, workspace.taskStates);
  if (currentStatus !== fromStatus) {
    throw new Error(`Task line ${operation.line} changed from '${fromStatus}' to '${currentStatus}'.`);
  }

  await updateTaskStatus(operation.path, operation.line, fromStatus, toStatus);
  await refreshDerivedViews();
}

async function applyTaskPriorityOperation(
  operation: TaskPriorityOperation,
  direction: "undo" | "redo",
) {
  const workspace = get(workspaceStore);
  const editor = get(editorSessionStore);
  const fromPriority = direction === "undo" ? operation.afterPriority : operation.beforePriority;
  const toPriority = direction === "undo" ? operation.beforePriority : operation.afterPriority;

  if (editor.path === operation.path) {
    const currentPriority = taskPriorityFromContent(
      editor.content,
      operation.line,
      workspace.taskStates,
    );
    if (currentPriority !== fromPriority) {
      throw new Error(`Task priority on line ${operation.line} changed. Refresh tasks.`);
    }

    const changed = editorSessionStore.setTaskPriorityLine(
      operation.line,
      toPriority,
      workspace.taskStates,
    );
    if (!changed) {
      throw new Error(`Line ${operation.line} is not a recognized task. Refresh tasks.`);
    }
    await editorSessionStore.save();
    await refreshDerivedViews();
    return;
  }

  const currentPriority = await taskPriorityFromDisk(
    operation.path,
    operation.line,
    workspace.taskStates,
  );
  if (currentPriority !== fromPriority) {
    throw new Error(`Task priority on line ${operation.line} changed. Refresh tasks.`);
  }

  await updateTaskPriority(operation.path, operation.line, toPriority);
  await refreshDerivedViews();
}

async function refreshDerivedViews() {
  await taskStore.refresh();
  await rightPaneStore.refresh();
}

async function checkboxStateFromDisk(path: string, line: number) {
  const page = await getPageView(path);
  const lineText = page.content.split(/\r?\n/)[line - 1] ?? "";
  const parsed = parseCheckboxListItem(lineText);
  if (!parsed) {
    throw new Error(`Line ${line} is not a recognized checkbox item.`);
  }
  return parsed.checkbox.checked;
}

async function taskStatusFromDisk(path: string, line: number, taskStates: string[]) {
  const page = await getPageView(path);
  const lineText = page.content.split(/\r?\n/)[line - 1] ?? "";
  const match = taskKeywordMatch(lineText, 0, taskStates);
  if (!match) {
    throw new Error(`Line ${line} is not a recognized task.`);
  }
  return match.status;
}

async function taskPriorityFromDisk(path: string, line: number, taskStates: string[]) {
  const page = await getPageView(path);
  return taskPriorityFromContent(page.content, line, taskStates);
}

function taskPriorityFromContent(content: string, line: number, taskStates: string[]) {
  const lineText = content.split(/\r?\n/)[line - 1] ?? "";
  return priorityCookieMatch(lineText, 0, taskStates)?.priority ?? null;
}

export const appUndoStore = createAppUndoStore();
