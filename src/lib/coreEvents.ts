import {
  closeWorkspace,
  onCoreEvent,
  updateEditorModeMenuLabel,
  updateEditMenuLabels,
  updateTaskOverviewMenuLabel,
  updateThemeMenuLabel,
} from "./api";
import { confirm as confirmDialog, message, open } from "@tauri-apps/plugin-dialog";
import { get } from "svelte/store";
import { runUserAction } from "./stores/appErrors.js";
import { appUndoStore } from "./stores/appUndo";
import { editorSessionStore } from "./stores/editorSession";
import { editorModeStore } from "./stores/editorMode";
import { mainViewStore } from "./stores/mainView";
import { rightPaneStore } from "./stores/rightPane";
import { taskStore } from "./stores/tasks";
import { themeStore } from "./stores/theme";
import { workspaceStore } from "./stores/workspace";
import { zoomStore } from "./stores/zoom";

let initialized = false;
let undoRunning = false;
let redoRunning = false;
let lastUndoKeyboardAt = 0;
let lastRedoKeyboardAt = 0;
let lastUndoMenuAt = 0;
let lastRedoMenuAt = 0;
const duplicateShortcutWindowMs = 300;
let editorUndoAvailable = false;
let editorRedoAvailable = false;

export async function setupCoreEvents() {
  if (initialized) {
    return;
  }

  initialized = true;

  await onCoreEvent("page-list-changed", async () => {
    if (!get(workspaceStore).root) {
      return;
    }

    await workspaceStore.refreshPages();
    if (!get(workspaceStore).root) {
      return;
    }

    await taskStore.refresh();
  });

  await onCoreEvent("index-updated", async () => {
    if (!get(workspaceStore).root) {
      return;
    }

    await rightPaneStore.refresh();
    if (!get(workspaceStore).root) {
      return;
    }

    await taskStore.refresh();
  });

  await onCoreEvent(
    "menu-open-workspace",
    userAction("Could not open the workspace folder dialog", openWorkspaceFromDialog),
  );

  await onCoreEvent(
    "menu-new-file",
    userAction("Could not create a new file", async () => {
      const workspace = get(workspaceStore);
      if (!workspace.root) {
        await message("Open a workspace before creating a file.", {
          title: "Semtags",
          kind: "warning",
        });
        return;
      }

      window.dispatchEvent(new CustomEvent("semtags-new-page", { detail: { folderPath: "" } }));
    }),
  );

  await onCoreEvent(
    "menu-close-workspace",
    userAction("Could not close the workspace", async () => {
      const editor = get(editorSessionStore);
      if (editor.saving) {
        await message("Wait for the current save to finish before closing the workspace.", {
          title: "Semtags",
          kind: "warning",
        });
        return;
      }

      if (
        (editor.dirty || editor.conflict) &&
        !(await confirmDialog("Close workspace and discard unsaved editor changes?", {
          title: "Semtags",
          kind: "warning",
        }))
      ) {
        return;
      }

      await closeWorkspace();
      clearWorkspaceUi();
    }),
  );

  await onCoreEvent("menu-save", async () => {
    await editorSessionStore.save();
  });

  setupUndoRedoMenuLabels();
  setupThemeMenuLabel();
  setupTaskOverviewMenuLabel();
  setupEditorModeMenuLabel();
  window.addEventListener("semtags-editor-history-availability", handleEditorHistoryAvailability);

  await onCoreEvent(
    "menu-undo",
    userAction("Could not undo the last action", () => handleUndoRequest("menu")),
  );

  await onCoreEvent(
    "menu-redo",
    userAction("Could not redo the last action", () => handleRedoRequest("menu")),
  );

  window.addEventListener("keydown", handleGlobalUndoKeydown, { capture: true });
  window.addEventListener("keydown", handleGlobalViewKeydown, { capture: true });

  await onCoreEvent("menu-toggle-dark-mode", async () => {
    await workspaceStore.saveThemeMode(themeStore.toggle());
  });

  await onCoreEvent("menu-toggle-task-overview", async () => {
    await toggleTaskOverview();
  });

  await onCoreEvent("menu-toggle-editor-mode", async () => {
    editorModeStore.toggle();
  });

  await onCoreEvent("menu-reset-layout", async () => {
    window.dispatchEvent(new CustomEvent("semtags-reset-layout"));
  });

  for (const level of [1, 2, 3, 4]) {
    await onCoreEvent(`menu-collapse-blocks-below-level-${level}`, async () => {
      mainViewStore.set("editor");
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("semtags-collapse-all-blocks-below-level", {
            detail: { level },
          }),
        );
      }, 0);
    });
  }

  await onCoreEvent("menu-expand-all-blocks", async () => {
    mainViewStore.set("editor");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("semtags-expand-all-blocks"));
    }, 0);
  });

  await onCoreEvent("menu-zoom-in", async () => {
    zoomStore.zoomIn();
  });

  await onCoreEvent("menu-zoom-out", async () => {
    zoomStore.zoomOut();
  });

  await onCoreEvent("menu-reset-zoom", async () => {
    zoomStore.reset();
  });

  await onCoreEvent("menu-about", async () => {
    window.dispatchEvent(new CustomEvent("semtags-show-about"));
  });

  await onCoreEvent("menu-keyboard-shortcuts", async () => {
    window.dispatchEvent(new CustomEvent("semtags-show-keyboard-shortcuts"));
  });
}

function setupThemeMenuLabel() {
  themeStore.subscribe((mode) => {
    void updateThemeMenuLabel(mode === "dark").catch(() => {});
  });
}

function setupTaskOverviewMenuLabel() {
  mainViewStore.subscribe((view) => {
    void updateTaskOverviewMenuLabel(view === "tasks").catch(() => {});
  });
}

function setupEditorModeMenuLabel() {
  editorModeStore.subscribe((mode) => {
    void updateEditorModeMenuLabel(mode === "live-preview").catch(() => {});
  });
}

function setupUndoRedoMenuLabels() {
  let lastUndoLabel: string | null | undefined;
  let lastRedoLabel: string | null | undefined;
  let lastUndoEnabled: boolean | undefined;
  let lastRedoEnabled: boolean | undefined;

  appUndoStore.subscribe((state) => {
    const undoEnabled = Boolean(state.nextUndoLabel) || editorUndoAvailable;
    const redoEnabled = Boolean(state.nextRedoLabel) || editorRedoAvailable;

    if (
      state.nextUndoLabel === lastUndoLabel &&
      state.nextRedoLabel === lastRedoLabel &&
      undoEnabled === lastUndoEnabled &&
      redoEnabled === lastRedoEnabled
    ) {
      return;
    }

    lastUndoLabel = state.nextUndoLabel;
    lastRedoLabel = state.nextRedoLabel;
    lastUndoEnabled = undoEnabled;
    lastRedoEnabled = redoEnabled;
    void updateEditMenuLabels(
      state.nextUndoLabel,
      state.nextRedoLabel,
      undoEnabled,
      redoEnabled,
    ).catch(() => {});
  });
}

function handleEditorHistoryAvailability(event: Event) {
  if (!(event instanceof CustomEvent)) {
    return;
  }

  editorUndoAvailable = Boolean(event.detail?.undo);
  editorRedoAvailable = Boolean(event.detail?.redo);
  const state = get(appUndoStore);
  void updateEditMenuLabels(
    state.nextUndoLabel,
    state.nextRedoLabel,
    Boolean(state.nextUndoLabel) || editorUndoAvailable,
    Boolean(state.nextRedoLabel) || editorRedoAvailable,
  ).catch(() => {});
}

function handleGlobalUndoKeydown(event: KeyboardEvent) {
  if (!isUndoRedoShortcut(event)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (isRedoShortcut(event)) {
    void runUserAction("Could not redo the last action", () =>
      handleRedoRequest("keyboard"),
    );
  } else {
    void runUserAction("Could not undo the last action", () =>
      handleUndoRequest("keyboard"),
    );
  }
}

function userAction(context: string, action: () => void | Promise<void>) {
  return async () => {
    await runUserAction(context, action);
  };
}

function handleGlobalViewKeydown(event: KeyboardEvent) {
  if (event.altKey || event.isComposing || !event.shiftKey || (!event.metaKey && !event.ctrlKey)) {
    return;
  }

  const key = event.key.toLowerCase();
  if (!["e", "t", "l"].includes(key)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (key === "e") {
    mainViewStore.set("editor");
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("semtags-expand-all-blocks"));
    }, 0);
    return;
  }

  if (key === "t") {
    void toggleTaskOverview();
    return;
  }

  if (key === "l") {
    editorModeStore.toggle();
  }
}

async function toggleTaskOverview() {
  if (get(mainViewStore) === "tasks") {
    mainViewStore.set("editor");
    return;
  }

  mainViewStore.set("tasks");
  await taskStore.refresh();
}

function isUndoRedoShortcut(event: KeyboardEvent) {
  if (event.altKey || event.isComposing) {
    return false;
  }

  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier) {
    return false;
  }

  const key = event.key.toLowerCase();
  return key === "z" || key === "y";
}

function isRedoShortcut(event: KeyboardEvent) {
  const key = event.key.toLowerCase();
  return key === "y" || (key === "z" && event.shiftKey);
}

async function handleUndoRequest(source: "keyboard" | "menu") {
  const now = Date.now();
  if (
    undoRunning ||
    (source === "menu" && now - lastUndoKeyboardAt < duplicateShortcutWindowMs) ||
    (source === "keyboard" && now - lastUndoMenuAt < duplicateShortcutWindowMs)
  ) {
    return;
  }

  undoRunning = true;
  if (source === "keyboard") {
    lastUndoKeyboardAt = now;
  } else {
    lastUndoMenuAt = now;
  }
  try {
    if (nativeEditableElementFocused()) {
      document.execCommand("undo");
      return;
    }

    const undone = await appUndoStore.undoLast();
    const undoState = get(appUndoStore);
    if (!undone && undoState.error) {
      await message(undoState.error, { title: "Semtags", kind: "warning" });
      return;
    }

    if (!undone && get(mainViewStore) === "editor") {
      window.dispatchEvent(new CustomEvent("semtags-editor-undo"));
    }
  } finally {
    undoRunning = false;
  }
}

async function handleRedoRequest(source: "keyboard" | "menu") {
  const now = Date.now();
  if (
    redoRunning ||
    (source === "menu" && now - lastRedoKeyboardAt < duplicateShortcutWindowMs) ||
    (source === "keyboard" && now - lastRedoMenuAt < duplicateShortcutWindowMs)
  ) {
    return;
  }

  redoRunning = true;
  if (source === "keyboard") {
    lastRedoKeyboardAt = now;
  } else {
    lastRedoMenuAt = now;
  }
  try {
    if (nativeEditableElementFocused()) {
      document.execCommand("redo");
      return;
    }

    const redone = await appUndoStore.redoLast();
    const undoState = get(appUndoStore);
    if (!redone && undoState.error) {
      await message(undoState.error, { title: "Semtags", kind: "warning" });
      return;
    }

    if (!redone && get(mainViewStore) === "editor") {
      window.dispatchEvent(new CustomEvent("semtags-editor-redo"));
    }
  } finally {
    redoRunning = false;
  }
}

function nativeEditableElementFocused() {
  const active = document.activeElement;
  if (!active) {
    return false;
  }

  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    return true;
  }

  if (!(active instanceof HTMLElement) || !active.isContentEditable) {
    return false;
  }

  return !active.closest(".cm-editor");
}

async function openWorkspaceFromDialog() {
  const selected = await open({
    directory: true,
    multiple: false,
    title: "Open Semtags workspace",
  });

  if (typeof selected === "string") {
    await workspaceStore.open(selected);
  }
}

function clearWorkspaceUi() {
  editorSessionStore.clear();
  rightPaneStore.clear();
  workspaceStore.clear();
  taskStore.clear();
  appUndoStore.clear();
  mainViewStore.set("editor");
}
