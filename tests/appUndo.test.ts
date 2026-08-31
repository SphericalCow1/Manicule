import assert from "node:assert/strict";
import test from "node:test";

import { get } from "svelte/store";
import {
  createAppUndoStore,
  type AppUndoDependencies,
} from "../src/lib/stores/appUndo.js";
import { taskPriorityChange } from "../src/lib/taskKeywords.js";
import type { TaskItem } from "../src/lib/types.js";

type EditorState = ReturnType<AppUndoDependencies["getEditorState"]>;

function baseHarness(editor: EditorState) {
  const calls: string[] = [];
  const disk = new Map<string, string>();

  const dependencies: AppUndoDependencies = {
    getEditorState: () => editor,
    getTaskStates: () => ["TODO", "WAITING", "DONE"],
    requestEditorHistoryChange: async (direction) => {
      calls.push(`editor:${direction}`);
      return true;
    },
    setEditorCheckboxLine: (_line, checked) => {
      calls.push(`checkbox:${checked}`);
      editor.content = editor.content.replace(/\[[ xX]\]/, checked ? "[x]" : "[ ]");
      return true;
    },
    setEditorTaskStatusLine: (_line, currentStatus, nextStatus) => {
      calls.push(`status:${currentStatus}->${nextStatus}`);
      if (!editor.content.includes(currentStatus)) {
        return false;
      }
      editor.content = editor.content.replace(currentStatus, nextStatus);
      return true;
    },
    setEditorTaskPriorityLine: (_line, priority, taskStates) => {
      calls.push(`priority:${priority ?? "none"}`);
      const change = taskPriorityChange(editor.content, 0, priority, taskStates);
      if (!change) {
        return false;
      }
      editor.content = `${editor.content.slice(0, change.from)}${change.insert}${editor.content.slice(change.to)}`;
      return true;
    },
    saveEditor: async () => {
      calls.push("save");
      return true;
    },
    getPageView: async (path) => ({
      page: { path, title: path, key: path.toLowerCase(), exists: true },
      content: disk.get(path) ?? "",
      backlinks: [],
      diagnostics: [],
    }),
    toggleCheckbox: async (path, line) => {
      const content = disk.get(path) ?? "";
      const checked = !/\[x\]/i.test(content);
      disk.set(path, content.replace(/\[[ xX]\]/, checked ? "[x]" : "[ ]"));
      calls.push(`disk-checkbox:${checked}`);
      return { path, line, checked };
    },
    updateTaskStatus: async (path, line, currentStatus, nextStatus) => {
      const content = disk.get(path) ?? "";
      disk.set(path, content.replace(currentStatus, nextStatus));
      calls.push(`disk-status:${currentStatus}->${nextStatus}`);
      return { task: task(path, line, nextStatus, priorityFromContent(disk.get(path) ?? "")) };
    },
    updateTaskPriority: async (path, line, priority) => {
      const content = disk.get(path) ?? "";
      const change = taskPriorityChange(content, 0, priority, ["TODO", "WAITING", "DONE"]);
      if (change) {
        disk.set(path, `${content.slice(0, change.from)}${change.insert}${content.slice(change.to)}`);
      }
      calls.push(`disk-priority:${priority ?? "none"}`);
      return { task: task(path, line, statusFromContent(disk.get(path) ?? ""), priority) };
    },
    refreshTasks: async () => {
      calls.push("refresh-tasks");
    },
    refreshRightPane: async () => {
      calls.push("refresh-right");
    },
  };

  return { calls, dependencies, disk };
}

function editorState(path: string | null, content: string): EditorState {
  return {
    path,
    content,
    dirty: false,
    saving: false,
    conflict: false,
    error: null,
  };
}

test("undoes and redoes editor, right-pane checkbox, editor in strict order", async () => {
  const editor = editorState("Inbox.md", "- [x] Checkbox");
  const { calls, dependencies } = baseHarness(editor);
  const store = createAppUndoStore(dependencies);

  store.recordEditorChange("Inbox.md");
  store.push({
    kind: "checkbox",
    path: "Inbox.md",
    line: 1,
    beforeChecked: false,
    afterChecked: true,
  });
  store.recordEditorChange("Inbox.md");

  assert.equal(await store.undoLast(), true);
  assert.equal(await store.undoLast(), true);
  assert.equal(await store.undoLast(), true);
  assert.equal(await store.redoLast(), true);
  assert.equal(await store.redoLast(), true);
  assert.equal(await store.redoLast(), true);

  assert.deepEqual(calls, [
    "editor:undo",
    "checkbox:false",
    "save",
    "refresh-tasks",
    "refresh-right",
    "editor:undo",
    "editor:redo",
    "checkbox:true",
    "save",
    "refresh-tasks",
    "refresh-right",
    "editor:redo",
  ]);
  assert.equal(get(store).nextUndoLabel, "Edit");
  assert.equal(get(store).nextRedoLabel, null);
});

test("routes status and priority undo through an open editor page", async () => {
  const editor = editorState("Inbox.md", "- DONE [#B] Item");
  const { calls, dependencies } = baseHarness(editor);
  const store = createAppUndoStore(dependencies);

  store.push({
    kind: "task-status",
    path: "Inbox.md",
    line: 1,
    beforeStatus: "TODO",
    afterStatus: "DONE",
  });
  store.push({
    kind: "task-priority",
    path: "Inbox.md",
    line: 1,
    beforePriority: "A",
    afterPriority: "B",
  });

  assert.equal(await store.undoLast(), true);
  assert.equal(await store.undoLast(), true);
  assert.equal(editor.content, "- TODO [#A] Item");
  assert.equal(await store.redoLast(), true);
  assert.equal(await store.redoLast(), true);
  assert.equal(editor.content, "- DONE [#B] Item");
  assert.deepEqual(
    calls.filter((call) => call.startsWith("status:") || call.startsWith("priority:")),
    ["priority:A", "status:DONE->TODO", "status:TODO->DONE", "priority:B"],
  );
});

test("keeps task-overview and backlink task changes in one disk-backed history", async () => {
  const editor = editorState("Other.md", "- TODO Other");
  const { calls, dependencies, disk } = baseHarness(editor);
  const store = createAppUndoStore(dependencies);
  disk.set("Tasks.md", "- DONE [#B] Shared task");

  const taskOverviewStatusChange = {
    kind: "task-status" as const,
    path: "Tasks.md",
    line: 1,
    beforeStatus: "TODO",
    afterStatus: "DONE",
  };
  const backlinkPriorityChange = {
    kind: "task-priority" as const,
    path: "Tasks.md",
    line: 1,
    beforePriority: "A",
    afterPriority: "B",
  };
  store.push(taskOverviewStatusChange);
  store.push(backlinkPriorityChange);

  assert.equal(await store.undoLast(), true);
  assert.equal(await store.undoLast(), true);
  assert.equal(disk.get("Tasks.md"), "- TODO [#A] Shared task");
  assert.equal(await store.redoLast(), true);
  assert.equal(await store.redoLast(), true);
  assert.equal(disk.get("Tasks.md"), "- DONE [#B] Shared task");
  assert.deepEqual(
    calls.filter((call) => call.startsWith("disk-")),
    [
      "disk-priority:A",
      "disk-status:DONE->TODO",
      "disk-status:TODO->DONE",
      "disk-priority:B",
    ],
  );
});

test("keeps a failed operation on the undo stack and reports the save error", async () => {
  const editor = editorState("Inbox.md", "- [x] Checkbox");
  editor.error = "File changed on disk.";
  const { dependencies } = baseHarness(editor);
  dependencies.saveEditor = async () => false;
  const store = createAppUndoStore(dependencies);
  store.push({
    kind: "checkbox",
    path: "Inbox.md",
    line: 1,
    beforeChecked: false,
    afterChecked: true,
  });

  assert.equal(await store.undoLast(), false);
  assert.equal(get(store).undoStack.length, 1);
  assert.equal(get(store).redoStack.length, 0);
  assert.equal(get(store).nextUndoLabel, "Uncheck");
  assert.equal(get(store).error, "File changed on disk.");
});

function task(path: string, line: number, status: string, priority: string | null): TaskItem {
  return {
    path,
    title: path,
    line,
    status,
    priority,
    sourceHeadings: [],
    parentBlocks: [],
    linkedPages: [],
    text: "Shared task",
    markdown: `- ${status} Shared task`,
  };
}

function statusFromContent(content: string) {
  return ["TODO", "WAITING", "DONE"].find((status) => content.includes(status)) ?? "TODO";
}

function priorityFromContent(content: string) {
  return /\[#([^\]]+)\]/.exec(content)?.[1] ?? null;
}
