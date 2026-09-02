import assert from "node:assert/strict";
import test from "node:test";

import {
  createMutationOperations,
  type MutationOperationDependencies,
} from "../src/lib/stores/mutationOperations.js";
import type { AppUndoMutationOperation } from "../src/lib/stores/appUndo.js";

type EditorState = ReturnType<MutationOperationDependencies["getEditorState"]>;

function harness(editor: EditorState) {
  const calls: string[] = [];
  const undoOperations: AppUndoMutationOperation[] = [];

  const dependencies: MutationOperationDependencies = {
    getEditorState: () => editor,
    getTaskConfig: () => ({
      taskStates: ["TODO", "WAITING", "DONE"],
      taskDoneSoundEnabled: true,
    }),
    toggleEditorCheckbox: (line) => {
      calls.push(`editor-checkbox:${line}`);
      return true;
    },
    setEditorTaskStatus: (line, currentStatus, nextStatus) => {
      calls.push(`editor-status:${line}:${currentStatus}->${nextStatus}`);
      return true;
    },
    setEditorTaskPriority: (line, priority) => {
      calls.push(`editor-priority:${line}:${priority ?? "none"}`);
      return true;
    },
    saveEditor: async () => {
      calls.push("save");
      return true;
    },
    toggleCheckbox: async (path, line) => {
      calls.push(`disk-checkbox:${path}:${line}`);
      return { path, line, checked: true };
    },
    updateTaskStatus: async (path, line, currentStatus, nextStatus) => {
      calls.push(`disk-status:${path}:${line}:${currentStatus}->${nextStatus}`);
      return { task: task(path, line, nextStatus, null) };
    },
    updateTaskPriority: async (path, line, priority) => {
      calls.push(`disk-priority:${path}:${line}:${priority ?? "none"}`);
      return { task: task(path, line, "TODO", priority) };
    },
    pushUndo: (operation) => {
      calls.push(`undo:${operation.kind}`);
      undoOperations.push(operation);
    },
    isolateEditorHistory: () => {
      calls.push("isolate");
    },
    refreshTasks: async () => {
      calls.push("refresh-tasks");
    },
    refreshRightPane: async () => {
      calls.push("refresh-right");
    },
    playDoneSound: (status, taskStates, enabled) => {
      calls.push(`sound:${status}:${taskStates.at(-1)}:${enabled}`);
    },
  };

  return { calls, dependencies, undoOperations };
}

function editorState(path: string | null): EditorState {
  return {
    path,
    dirty: false,
    saving: false,
    conflict: false,
    error: null,
  };
}

test("coordinates an editor-backed checkbox change in one operation", async () => {
  const editor = editorState("Inbox.md");
  editor.dirty = true;
  const { calls, dependencies, undoOperations } = harness(editor);
  const operations = createMutationOperations(dependencies);

  const outcome = await operations.toggleCheckbox("Inbox.md", 4, false);

  assert.deepEqual(outcome, { status: "changed", error: null });
  assert.deepEqual(calls, [
    "isolate",
    "editor-checkbox:4",
    "save",
    "undo:checkbox",
    "refresh-tasks",
    "refresh-right",
    "isolate",
  ]);
  assert.deepEqual(undoOperations, [
    {
      kind: "checkbox",
      path: "Inbox.md",
      line: 4,
      beforeChecked: false,
      afterChecked: true,
    },
  ]);
});

test("routes disk-backed status and priority changes through the same policy", async () => {
  const editor = editorState("Other.md");
  const { calls, dependencies, undoOperations } = harness(editor);
  const operations = createMutationOperations(dependencies);

  assert.deepEqual(
    await operations.setTaskStatus("Tasks.md", 2, "TODO", "DONE"),
    { status: "changed", error: null },
  );
  assert.deepEqual(
    await operations.setTaskPriority("Tasks.md", 2, null, "A"),
    { status: "changed", error: null },
  );

  assert.deepEqual(calls, [
    "isolate",
    "disk-status:Tasks.md:2:TODO->DONE",
    "undo:task-status",
    "sound:DONE:DONE:true",
    "refresh-tasks",
    "refresh-right",
    "isolate",
    "isolate",
    "disk-priority:Tasks.md:2:A",
    "undo:task-priority",
    "refresh-tasks",
    "refresh-right",
    "isolate",
  ]);
  assert.equal(undoOperations.length, 2);
});

test("records the canonical task location returned by the backend", async () => {
  const editor = editorState(null);
  const { dependencies, undoOperations } = harness(editor);
  dependencies.updateTaskStatus = async (_path, _line, _currentStatus, nextStatus) => ({
    task: task("tasks/Inbox.md", 5, nextStatus, null),
  });
  const operations = createMutationOperations(dependencies);

  await operations.setTaskStatus("Tasks/inbox.md", 4, "TODO", "DONE");

  assert.deepEqual(undoOperations, [
    {
      kind: "task-status",
      path: "tasks/Inbox.md",
      line: 5,
      beforeStatus: "TODO",
      afterStatus: "DONE",
    },
  ]);
});

test("rejects rendered mutations while the target editor page has a conflict", async () => {
  const editor = editorState("Inbox.md");
  editor.dirty = true;
  editor.conflict = true;
  const { calls, dependencies, undoOperations } = harness(editor);
  const operations = createMutationOperations(dependencies);

  const outcome = await operations.setTaskStatus("Inbox.md", 3, "TODO", "DONE");

  assert.deepEqual(outcome, {
    status: "failed",
    error:
      "Wait for the current save or resolve the editor conflict before changing this task status.",
  });
  assert.deepEqual(calls, []);
  assert.deepEqual(undoOperations, []);
});

test("does not report success, record undo, refresh, or play sound after a failed save", async () => {
  const editor = editorState("Inbox.md");
  const { calls, dependencies, undoOperations } = harness(editor);
  dependencies.saveEditor = async () => {
    calls.push("save");
    editor.error = "File changed on disk.";
    return false;
  };
  const operations = createMutationOperations(dependencies);

  const outcome = await operations.setTaskStatus("Inbox.md", 3, "TODO", "DONE");

  assert.deepEqual(outcome, { status: "failed", error: "File changed on disk." });
  assert.deepEqual(calls, ["isolate", "editor-status:3:TODO->DONE", "save", "isolate"]);
  assert.deepEqual(undoOperations, []);
});

test("returns a contextual failure when a disk mutation is rejected", async () => {
  const editor = editorState(null);
  const { calls, dependencies, undoOperations } = harness(editor);
  dependencies.updateTaskPriority = async () => {
    throw new Error("line changed externally");
  };
  const operations = createMutationOperations(dependencies);

  const outcome = await operations.setTaskPriority("Tasks.md", 8, "A", "B");

  assert.deepEqual(outcome, {
    status: "failed",
    error: "Could not change task priority: line changed externally",
  });
  assert.deepEqual(calls, ["isolate", "isolate"]);
  assert.deepEqual(undoOperations, []);
});

test("treats requests without an actual state transition as unchanged", async () => {
  const editor = editorState(null);
  const { calls, dependencies } = harness(editor);
  const operations = createMutationOperations(dependencies);

  assert.deepEqual(await operations.toggleCheckbox(null, 1, false), {
    status: "unchanged",
    error: null,
  });
  assert.deepEqual(await operations.setTaskStatus("Tasks.md", 1, "TODO", "TODO"), {
    status: "unchanged",
    error: null,
  });
  assert.deepEqual(await operations.setTaskPriority("Tasks.md", 1, "A", "A"), {
    status: "unchanged",
    error: null,
  });
  assert.deepEqual(calls, []);
});

function task(path: string, line: number, status: string, priority: string | null) {
  return {
    path,
    title: path,
    line,
    status,
    priority,
    sourceHeadings: [],
    parentBlocks: [],
    linkedPages: [],
    text: "Task",
    markdown: `- ${status} Task`,
  };
}
