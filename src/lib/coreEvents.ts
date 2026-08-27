import { closeWorkspace, onCoreEvent, updateEditMenuLabels } from "./api";
import { confirm as confirmDialog, message, open } from "@tauri-apps/plugin-dialog";
import { get } from "svelte/store";
import { appUndoStore } from "./stores/appUndo";
import { editorSessionStore } from "./stores/editorSession";
import { editorModeStore } from "./stores/editorMode";
import { mainViewStore } from "./stores/mainView";
import { rightPaneStore } from "./stores/rightPane";
import { taskStore } from "./stores/tasks";
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

  await onCoreEvent("menu-open-workspace", async () => {
    await openWorkspaceFromDialog();
  });

  await onCoreEvent("menu-new-file", async () => {
    const workspace = get(workspaceStore);
    if (!workspace.root) {
      await message("Open a workspace before creating a file.", {
        title: "Semtags",
        kind: "warning",
      });
      return;
    }

    window.dispatchEvent(new CustomEvent("semtags-new-page", { detail: { folderPath: "" } }));
  });

  await onCoreEvent("menu-close-workspace", async () => {
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
  });

  await onCoreEvent("menu-save", async () => {
    await editorSessionStore.save();
  });

  setupUndoRedoMenuLabels();
  window.addEventListener("semtags-editor-history-availability", handleEditorHistoryAvailability);

  await onCoreEvent("menu-undo", () => handleUndoRequest("menu"));

  await onCoreEvent("menu-redo", () => handleRedoRequest("menu"));

  window.addEventListener("keydown", handleGlobalUndoKeydown, { capture: true });
  window.addEventListener("keydown", handleGlobalViewKeydown, { capture: true });

  await onCoreEvent("menu-show-editor", async () => {
    mainViewStore.set("editor");
  });

  await onCoreEvent("menu-show-tasks", async () => {
    mainViewStore.set("tasks");
    await taskStore.refresh();
  });

  await onCoreEvent("menu-editor-mode-live", async () => {
    editorModeStore.set("live-preview");
  });

  await onCoreEvent("menu-editor-mode-source", async () => {
    editorModeStore.set("source");
  });

  await onCoreEvent("menu-reset-layout", async () => {
    window.dispatchEvent(new CustomEvent("semtags-reset-layout"));
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
    void handleRedoRequest("keyboard");
  } else {
    void handleUndoRequest("keyboard");
  }
}

function handleGlobalViewKeydown(event: KeyboardEvent) {
  if (event.altKey || event.isComposing || !event.shiftKey || (!event.metaKey && !event.ctrlKey)) {
    return;
  }

  const key = event.key.toLowerCase();
  if (!["e", "t", "l", "m"].includes(key)) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();

  if (key === "e") {
    mainViewStore.set("editor");
    return;
  }

  if (key === "t") {
    mainViewStore.set("tasks");
    void taskStore.refresh();
    return;
  }

  if (key === "l") {
    editorModeStore.set("live-preview");
    return;
  }

  editorModeStore.set("source");
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
