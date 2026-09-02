import { writable } from "svelte/store";
import type { EditorMode } from "../editorLivePreview";

const storageKey = "manicule:editor-mode";

function loadEditorMode(): EditorMode {
  if (typeof localStorage === "undefined") {
    return "live-preview";
  }

  const stored = localStorage.getItem(storageKey);
  return stored === "source" || stored === "live-preview" ? stored : "live-preview";
}

function createEditorModeStore() {
  const { subscribe, set } = writable<EditorMode>(loadEditorMode());

  return {
    subscribe,
    set(mode: EditorMode) {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(storageKey, mode);
      }
      set(mode);
    },
    toggle() {
      let nextMode: EditorMode = "live-preview";
      const unsubscribe = subscribe((mode) => {
        nextMode = mode === "live-preview" ? "source" : "live-preview";
      });
      unsubscribe();
      this.set(nextMode);
    },
  };
}

export const editorModeStore = createEditorModeStore();
