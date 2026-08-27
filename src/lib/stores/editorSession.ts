import { openPage, savePage } from "../api";
import { createEditorSessionStore } from "./createEditorSessionStore";
import { rightPaneStore } from "./rightPane";
import { workspaceStore } from "./workspace";

export const editorSessionStore = createEditorSessionStore({
  openPage,
  savePage,
  refreshPages: () => workspaceStore.refreshPages(),
  refreshRightPane: () => rightPaneStore.refresh(),
  autoSaveDelayMs: 3000,
});
