import assert from "node:assert/strict";
import test from "node:test";

import {
  history,
  isolateHistory,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from "@codemirror/commands";
import { EditorState, Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { minimalTextChange } from "../src/lib/textChanges.js";

test("CodeMirror history depth identifies real editor undo groups", () => {
  let state = EditorState.create({ doc: "", extensions: [history()] });

  state = typeText(state, 0, "a");
  assert.equal(undoDepth(state), 1);

  state = typeText(state, 1, "b");
  assert.equal(undoDepth(state), 1);

  state = state.update({
    annotations: [Transaction.addToHistory.of(false), isolateHistory.of("full")],
  }).state;
  state = typeText(state, 2, "c");
  assert.equal(undoDepth(state), 2);
});

test("localized external mutations preserve a longer mixed undo and redo sequence", () => {
  let state = EditorState.create({
    doc: "- TODO [ ] task\nabc",
    extensions: [history()],
  });

  state = typeText(state, state.doc.length, "d");
  state = isolate(state);
  state = replaceExternalText(state, state.doc.toString().replace("[ ]", "[x]"));
  state = isolate(state);
  state = typeText(state, state.doc.length, "e");
  state = isolate(state);
  state = replaceExternalText(state, state.doc.toString().replace("TODO", "DONE"));
  state = isolate(state);
  state = typeText(state, state.doc.length, "f");

  assert.equal(undoDepth(state), 3);
  [state] = runHistoryCommand(state, undo);
  assert.equal(state.doc.toString(), "- DONE [x] task\nabcde");

  state = replaceExternalText(state, state.doc.toString().replace("DONE", "TODO"));
  state = isolate(state);
  [state] = runHistoryCommand(state, undo);
  assert.equal(state.doc.toString(), "- TODO [x] task\nabcd");

  state = replaceExternalText(state, state.doc.toString().replace("[x]", "[ ]"));
  state = isolate(state);
  [state] = runHistoryCommand(state, undo);
  assert.equal(state.doc.toString(), "- TODO [ ] task\nabc");
  assert.equal(redoDepth(state), 3);

  [state] = runHistoryCommand(state, redo);
  state = replaceExternalText(state, state.doc.toString().replace("[ ]", "[x]"));
  state = isolate(state);
  [state] = runHistoryCommand(state, redo);
  state = replaceExternalText(state, state.doc.toString().replace("TODO", "DONE"));
  state = isolate(state);
  [state] = runHistoryCommand(state, redo);
  assert.equal(state.doc.toString(), "- DONE [x] task\nabcdef");
});

function typeText(state: EditorState, from: number, insert: string) {
  return state.update({
    changes: { from, insert },
    annotations: Transaction.userEvent.of("input.type"),
  }).state;
}

function isolate(state: EditorState) {
  return state.update({
    annotations: [Transaction.addToHistory.of(false), isolateHistory.of("full")],
  }).state;
}

function replaceExternalText(state: EditorState, content: string) {
  const change = minimalTextChange(state.doc.toString(), content);
  if (!change) {
    throw new Error("Expected external content to change");
  }
  return state.update({
    changes: change,
    annotations: Transaction.addToHistory.of(false),
  }).state;
}

function runHistoryCommand(
  state: EditorState,
  command: typeof undo,
): [EditorState, boolean] {
  let nextState = state;
  const changed = command({
    state,
    dispatch(transaction: Transaction) {
      nextState = transaction.state;
    },
  } as EditorView);
  return [nextState, changed];
}
