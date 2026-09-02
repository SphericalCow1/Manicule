import { get } from "svelte/store";
import { toggleCheckbox, updateTaskPriority, updateTaskStatus } from "../api.js";
import { toErrorMessage } from "../errors.js";
import { playTaskDoneSound } from "../taskCompletionSound.js";
import type { ToggleCheckboxResult, UpdateTaskStatusResult } from "../types.js";
import {
  appUndoStore,
  type AppUndoMutationOperation,
} from "./appUndo.js";
import { editorSessionStore } from "./editorSession.js";
import { rightPaneStore } from "./rightPane.js";
import { taskStore } from "./tasks.js";
import { workspaceStore } from "./workspace.js";

type MutationEditorState = {
  path: string | null;
  dirty: boolean;
  saving: boolean;
  conflict: boolean;
  error: string | null;
};

export type MutationOutcome =
  | { status: "changed"; error: null }
  | { status: "unchanged"; error: null }
  | { status: "failed"; error: string };

export type MutationOperationDependencies = {
  getEditorState: () => MutationEditorState;
  getTaskConfig: () => {
    taskStates: string[];
    taskDoneSoundEnabled: boolean;
  };
  toggleEditorCheckbox: (line: number) => boolean;
  setEditorTaskStatus: (
    line: number,
    currentStatus: string,
    nextStatus: string,
    taskStates: string[],
  ) => boolean;
  setEditorTaskPriority: (
    line: number,
    priority: string | null,
    taskStates: string[],
  ) => boolean;
  saveEditor: () => Promise<boolean>;
  toggleCheckbox: (path: string, line: number) => Promise<ToggleCheckboxResult>;
  updateTaskStatus: (
    path: string,
    line: number,
    currentStatus: string,
    nextStatus: string,
  ) => Promise<UpdateTaskStatusResult>;
  updateTaskPriority: (
    path: string,
    line: number,
    priority: string | null,
  ) => Promise<UpdateTaskStatusResult>;
  pushUndo: (operation: AppUndoMutationOperation) => void;
  isolateEditorHistory: () => void;
  refreshTasks: () => Promise<void>;
  refreshRightPane: () => Promise<void>;
  playDoneSound: (nextStatus: string, taskStates: string[], enabled: boolean) => void;
};

const changed: MutationOutcome = { status: "changed", error: null };
const unchanged: MutationOutcome = { status: "unchanged", error: null };

const defaultDependencies: MutationOperationDependencies = {
  getEditorState: () => get(editorSessionStore),
  getTaskConfig: () => {
    const workspace = get(workspaceStore);
    return {
      taskStates: workspace.taskStates,
      taskDoneSoundEnabled: workspace.taskDoneSoundEnabled,
    };
  },
  toggleEditorCheckbox: (line) => editorSessionStore.toggleCheckboxLine(line),
  setEditorTaskStatus: (line, currentStatus, nextStatus, taskStates) =>
    editorSessionStore.setTaskStatusLine(line, currentStatus, nextStatus, taskStates),
  setEditorTaskPriority: (line, priority, taskStates) =>
    editorSessionStore.setTaskPriorityLine(line, priority, taskStates),
  saveEditor: () => editorSessionStore.save(),
  toggleCheckbox,
  updateTaskStatus,
  updateTaskPriority,
  pushUndo: (operation) => appUndoStore.push(operation),
  isolateEditorHistory: () => {
    window.dispatchEvent(new CustomEvent("semtags-editor-isolate-history"));
  },
  refreshTasks: () => taskStore.refresh(),
  refreshRightPane: () => rightPaneStore.refresh(),
  playDoneSound: playTaskDoneSound,
};

export function createMutationOperations(
  dependencies: MutationOperationDependencies = defaultDependencies,
) {
  return {
    async toggleCheckbox(
      path: string | null,
      line: number,
      previousChecked: boolean,
    ): Promise<MutationOutcome> {
      if (!path) {
        return unchanged;
      }

      const guard = editorGuard(dependencies.getEditorState(), path, "changing this checkbox");
      if (guard) {
        return guard;
      }

      dependencies.isolateEditorHistory();
      try {
        const editor = dependencies.getEditorState();
        if (editor.path === path) {
          if (!dependencies.toggleEditorCheckbox(line)) {
            return failed(`Line ${line} is not a recognized checkbox item.`);
          }
          if (!(await dependencies.saveEditor())) {
            return failed(
              dependencies.getEditorState().error ?? "Checkbox change could not be saved.",
            );
          }
          dependencies.pushUndo({
            kind: "checkbox",
            path,
            line,
            beforeChecked: previousChecked,
            afterChecked: !previousChecked,
          });
        } else {
          const result = await dependencies.toggleCheckbox(path, line);
          dependencies.pushUndo({
            kind: "checkbox",
            path: result.path,
            line: result.line,
            beforeChecked: previousChecked,
            afterChecked: result.checked,
          });
        }

        await refreshDerivedViews(dependencies);
        return changed;
      } catch (error) {
        return failed(`Could not change checkbox: ${toErrorMessage(error)}`);
      } finally {
        dependencies.isolateEditorHistory();
      }
    },

    async setTaskStatus(
      path: string | null,
      line: number,
      currentStatus: string,
      nextStatus: string,
    ): Promise<MutationOutcome> {
      if (!path || !nextStatus || currentStatus === nextStatus) {
        return unchanged;
      }

      const guard = editorGuard(dependencies.getEditorState(), path, "changing this task status");
      if (guard) {
        return guard;
      }

      const { taskStates, taskDoneSoundEnabled } = dependencies.getTaskConfig();

      dependencies.isolateEditorHistory();
      try {
        const editor = dependencies.getEditorState();
        let operationPath = path;
        let operationLine = line;
        if (editor.path === path) {
          if (!dependencies.setEditorTaskStatus(line, currentStatus, nextStatus, taskStates)) {
            return failed(`Line ${line} is not a recognized task. Refresh tasks.`);
          }
          if (!(await dependencies.saveEditor())) {
            return failed(
              dependencies.getEditorState().error ?? "Task status could not be saved.",
            );
          }
        } else {
          const result = await dependencies.updateTaskStatus(
            path,
            line,
            currentStatus,
            nextStatus,
          );
          operationPath = result.task.path;
          operationLine = result.task.line;
        }

        dependencies.pushUndo({
          kind: "task-status",
          path: operationPath,
          line: operationLine,
          beforeStatus: currentStatus,
          afterStatus: nextStatus,
        });
        dependencies.playDoneSound(nextStatus, taskStates, taskDoneSoundEnabled);
        await refreshDerivedViews(dependencies);
        return changed;
      } catch (error) {
        return failed(`Could not change task status: ${toErrorMessage(error)}`);
      } finally {
        dependencies.isolateEditorHistory();
      }
    },

    async setTaskPriority(
      path: string | null,
      line: number,
      currentPriority: string | null,
      nextPriority: string | null,
    ): Promise<MutationOutcome> {
      if (!path || currentPriority === nextPriority) {
        return unchanged;
      }

      const guard = editorGuard(dependencies.getEditorState(), path, "changing this task priority");
      if (guard) {
        return guard;
      }

      const { taskStates } = dependencies.getTaskConfig();

      dependencies.isolateEditorHistory();
      try {
        const editor = dependencies.getEditorState();
        let operationPath = path;
        let operationLine = line;
        if (editor.path === path) {
          if (!dependencies.setEditorTaskPriority(line, nextPriority, taskStates)) {
            return failed(`Line ${line} is not a recognized task. Refresh tasks.`);
          }
          if (!(await dependencies.saveEditor())) {
            return failed(
              dependencies.getEditorState().error ?? "Task priority could not be saved.",
            );
          }
        } else {
          const result = await dependencies.updateTaskPriority(path, line, nextPriority);
          operationPath = result.task.path;
          operationLine = result.task.line;
        }

        dependencies.pushUndo({
          kind: "task-priority",
          path: operationPath,
          line: operationLine,
          beforePriority: currentPriority,
          afterPriority: nextPriority,
        });
        await refreshDerivedViews(dependencies);
        return changed;
      } catch (error) {
        return failed(`Could not change task priority: ${toErrorMessage(error)}`);
      } finally {
        dependencies.isolateEditorHistory();
      }
    },
  };
}

function editorGuard(
  editor: MutationEditorState,
  path: string,
  action: string,
): MutationOutcome | null {
  if (
    editor.path !== path ||
    (!editor.saving && !editor.conflict)
  ) {
    return null;
  }

  return failed(`Wait for the current save or resolve the editor conflict before ${action}.`);
}

async function refreshDerivedViews(dependencies: MutationOperationDependencies) {
  await dependencies.refreshTasks();
  await dependencies.refreshRightPane();
}

function failed(error: string): MutationOutcome {
  return { status: "failed", error };
}

export const mutationOperations = createMutationOperations();
