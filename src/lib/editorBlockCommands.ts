import { EditorSelection, Prec, type ChangeSpec, type EditorState } from "@codemirror/state";
import { keymap, type Command } from "@codemirror/view";
import { listItemTextFrom, parseListItemPrefix } from "./markdownPatterns.js";
import { DEFAULT_TASK_STATES, taskKeywordMatch } from "./taskKeywords.js";

const blockIndent = "  ";

export function listContinuationPrefix(lineText: string) {
  const prefix = parseListItemPrefix(lineText);
  if (!prefix) {
    return null;
  }

  const checkbox = prefix.checkbox?.trailingWhitespace
    ? `${prefix.checkbox.marker}${prefix.checkbox.trailingWhitespace}`
    : "";
  return `${prefix.indentation}${nextListMarker(prefix.marker)} ${checkbox}`;
}

export function listBlockPrefix(lineText: string) {
  const prefix = parseListItemPrefix(lineText);
  if (!prefix) {
    return null;
  }

  const checkbox = prefix.checkbox?.trailingWhitespace
    ? `${prefix.checkbox.marker}${prefix.checkbox.trailingWhitespace}`
    : "";
  return `${prefix.indentation}${prefix.marker} ${checkbox}`;
}

export function insertedListBlockPrefix(lines: string[], lineNumber: number) {
  const currentLine = lines[lineNumber - 1] ?? "";
  const current = listItemInfo(currentLine);
  const nextLine = lines[lineNumber] ?? "";
  const next = listItemInfo(nextLine);

  if (current && next && next.indent > current.indent) {
    return listContinuationPrefix(nextLine);
  }

  return listContinuationPrefix(currentLine);
}

export function renumberOrderedListLinesAfterInsertion(lines: string[], insertedLineNumber: number) {
  const inserted = orderedListItemInfo(lines[insertedLineNumber - 1] ?? "");
  if (!inserted) {
    return lines;
  }

  const nextLines = [...lines];
  let expectedNumber = inserted.number + 1;

  for (let lineNumber = insertedLineNumber + 1; lineNumber <= nextLines.length; lineNumber += 1) {
    const lineText = nextLines[lineNumber - 1] ?? "";
    if (lineText.trim() === "") {
      break;
    }

    const item = listItemInfo(lineText);
    if (!item) {
      if (blockIndentWidth(lineText) <= inserted.indent) {
        break;
      }
      continue;
    }

    if (item.indent < inserted.indent) {
      break;
    }

    if (item.indent > inserted.indent) {
      continue;
    }

    const ordered = orderedListItemInfo(lineText);
    if (!ordered || ordered.delimiter !== inserted.delimiter) {
      break;
    }

    nextLines[lineNumber - 1] =
      `${lineText.slice(0, ordered.markerFrom)}${expectedNumber}${ordered.delimiter}${lineText.slice(ordered.markerTo)}`;
    expectedNumber += 1;
  }

  return nextLines;
}

export function indentLineText(lineText: string) {
  return `${blockIndent}${lineText}`;
}

export function outdentLineText(lineText: string) {
  if (lineText.startsWith(blockIndent)) {
    return lineText.slice(blockIndent.length);
  }

  if (lineText.startsWith("\t")) {
    return lineText.slice(1);
  }

  if (lineText.startsWith(" ")) {
    return lineText.slice(1);
  }

  return lineText;
}

export function emptyListBlockRange(lineText: string) {
  return /^\s*(?:[-*+]|\d+[.)])\s*(?:\[[ xX]\])?\s*$/.test(lineText);
}

export function emptyListLineAfterEnter(lineText: string) {
  if (!emptyListBlockRange(lineText)) {
    return null;
  }

  const outdented = outdentLineText(lineText);
  return outdented === lineText ? "" : outdented;
}

export function blockLineBreakPrefix(lines: string[], lineNumber: number) {
  const boundedLine = Math.min(Math.max(lineNumber, 1), lines.length);
  const currentLine = lines[boundedLine - 1] ?? "";
  const current = parseListItemPrefix(currentLine);
  if (current) {
    return `${current.indentation}${blockIndent}`;
  }

  const currentIndent = blockIndentWidth(currentLine);
  if (currentIndent === 0) {
    return null;
  }

  for (let index = boundedLine - 1; index >= 1; index -= 1) {
    const previousLine = lines[index - 1] ?? "";
    if (previousLine.trim() === "") {
      return null;
    }

    const previous = parseListItemPrefix(previousLine);
    if (previous && blockIndentWidth(previousLine) < currentIndent) {
      return `${previous.indentation}${blockIndent}`;
    }
  }

  return null;
}

export function blockLineBreakText(lines: string[], lineNumber: number) {
  const prefix = blockLineBreakPrefix(lines, lineNumber);
  return prefix === null ? null : `  \n${prefix}`;
}

export function nextTaskLineText(lineText: string, taskStates = DEFAULT_TASK_STATES) {
  const states = taskStates.length > 0 ? taskStates : DEFAULT_TASK_STATES;
  const statusMatch = taskKeywordMatch(lineText, 0, states);

  if (statusMatch) {
    const currentIndex = states.indexOf(statusMatch.status);
    const nextStatus = states[(currentIndex + 1) % states.length] ?? states[0];
    return `${lineText.slice(0, statusMatch.from)}${nextStatus}${lineText.slice(statusMatch.to)}`;
  }

  const listItem = parseListItemPrefix(lineText);
  if (listItem) {
    const contentFrom = listItemTextFrom(listItem);
    return `${lineText.slice(0, contentFrom)}${states[0]} ${lineText.slice(contentFrom)}`;
  }

  return null;
}

export const insertListBlock: Command = (view) => {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  const emptyListLine = emptyListLineAfterEnter(line.text);
  if (selection.head === line.to && emptyListLine !== null) {
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: emptyListLine },
      selection: EditorSelection.cursor(line.from + emptyListLine.length),
      scrollIntoView: true,
    });
    return true;
  }

  if (selection.head === line.from) {
    const prefix = listBlockPrefix(line.text);
    if (!prefix) {
      return false;
    }

    view.dispatch({
      changes: { from: line.from, insert: `${prefix}\n` },
      selection: EditorSelection.cursor(line.from + prefix.length),
      scrollIntoView: true,
    });
    return true;
  }

  const prefix = insertedListBlockPrefix(documentLines(view.state), line.number);
  if (!prefix) {
    return false;
  }

  const renumberChanges = orderedListRenumberChanges(
    view.state,
    line.number + 1,
    prefix,
  );
  view.dispatch({
    changes: [
      { from: selection.head, insert: `\n${prefix}` },
      ...renumberChanges,
    ],
    selection: EditorSelection.cursor(selection.head + prefix.length + 1),
    scrollIntoView: true,
  });
  return true;
};

export const insertBlockLineBreak: Command = (view) => {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  const lineBreak = blockLineBreakText(documentLines(view.state), line.number);
  if (lineBreak === null) {
    return false;
  }

  view.dispatch({
    changes: { from: selection.head, insert: lineBreak },
    selection: EditorSelection.cursor(selection.head + lineBreak.length),
    scrollIntoView: true,
  });
  return true;
};

export const deleteEmptyListBlock: Command = (view) => {
  const selection = view.state.selection.main;
  if (!selection.empty) {
    return false;
  }

  const line = view.state.doc.lineAt(selection.head);
  if (selection.head !== line.to || !emptyListBlockRange(line.text)) {
    return false;
  }

  if (line.number === 1) {
    view.dispatch({
      changes: { from: line.from, to: line.to },
      selection: EditorSelection.cursor(line.from),
      scrollIntoView: true,
    });
    return true;
  }

  const previousLine = view.state.doc.line(line.number - 1);
  view.dispatch({
    changes: { from: previousLine.to, to: line.to },
    selection: EditorSelection.cursor(previousLine.to),
    scrollIntoView: true,
  });
  return true;
};

export const indentSelectedBlocks: Command = (view) => {
  const changes = selectedBlockLineNumbers(view.state)
    .map((lineNumber) => view.state.doc.line(lineNumber))
    .map((line): ChangeSpec => ({ from: line.from, insert: blockIndent }));

  if (changes.length === 0) {
    return false;
  }

  view.dispatch({ changes, scrollIntoView: true });
  return true;
};

export const outdentSelectedBlocks: Command = (view) => {
  const changes = selectedBlockLineNumbers(view.state)
    .map((lineNumber) => view.state.doc.line(lineNumber))
    .flatMap((line): ChangeSpec[] => {
      const outdented = outdentLineText(line.text);
      const removed = line.text.length - outdented.length;
      return removed > 0 ? [{ from: line.from, to: line.from + removed }] : [];
    });

  if (changes.length === 0) {
    return false;
  }

  view.dispatch({ changes, scrollIntoView: true });
  return true;
};

export function toggleCurrentTaskStatus(
  taskStates = DEFAULT_TASK_STATES,
  onStatusChange: (nextStatus: string) => void = () => {},
): Command {
  return (view) => {
    const selection = view.state.selection.main;
    if (!selection.empty) {
      return false;
    }

    const line = view.state.doc.lineAt(selection.head);
    const nextLineText = nextTaskLineText(line.text, taskStates);
    if (nextLineText === null) {
      return false;
    }

    const cursorOffset = Math.min(selection.head - line.from, nextLineText.length);
    const nextStatus = taskKeywordMatch(nextLineText, 0, taskStates)?.status ?? null;
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: nextLineText },
      selection: EditorSelection.cursor(line.from + cursorOffset),
      scrollIntoView: true,
    });
    if (nextStatus) {
      onStatusChange(nextStatus);
    }
    return true;
  };
}

export function moveCurrentBlock(direction: "up" | "down"): Command {
  return (view) => {
    const selection = view.state.selection.main;
    if (!selection.empty) {
      return false;
    }

    const lineNumber = view.state.doc.lineAt(selection.head).number;
    const lines = documentLines(view.state);
    const moved = moveBlockLines(lines, lineNumber, direction);
    if (!moved) {
      return false;
    }

    const currentLine = view.state.doc.lineAt(selection.head);
    const movedLineOffset = currentLine.number - moved.previous.current.startLine;
    const cursorColumn = selection.head - currentLine.from;
    const nextDoc = moved.lines.join("\n");
    const nextCursor = lineColumnToPosition(
      moved.lines,
      moved.movedStartLine + movedLineOffset,
      cursorColumn,
    );

    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: nextDoc },
      selection: EditorSelection.cursor(nextCursor),
      scrollIntoView: true,
    });
    return true;
  };
}

export function movableBlockRanges(
  lines: string[],
  lineNumber: number,
  direction: "up" | "down",
) {
  const current = blockRangeForLines(lines, lineNumber);
  const target =
    direction === "up"
      ? previousSiblingRange(lines, current)
      : nextSiblingRange(lines, current);

  return target ? { current, target } : null;
}

export function moveBlockLines(
  lines: string[],
  lineNumber: number,
  direction: "up" | "down",
) {
  const previous = movableBlockRanges(lines, lineNumber, direction);
  if (!previous) {
    return null;
  }

  const { current, target } = previous;
  const currentChunk = lines.slice(current.startLine - 1, current.endLine);
  const targetChunk = lines.slice(target.startLine - 1, target.endLine);

  if (direction === "up") {
    const beforeTarget = lines.slice(0, target.startLine - 1);
    const between = lines.slice(target.endLine, current.startLine - 1);
    const afterCurrent = lines.slice(current.endLine);

    return {
      lines: [...beforeTarget, ...currentChunk, ...between, ...targetChunk, ...afterCurrent],
      movedStartLine: target.startLine,
      previous,
    };
  }

  const beforeCurrent = lines.slice(0, current.startLine - 1);
  const between = lines.slice(current.endLine, target.startLine - 1);
  const afterTarget = lines.slice(target.endLine);

  return {
    lines: [...beforeCurrent, ...targetChunk, ...between, ...currentChunk, ...afterTarget],
    movedStartLine: current.startLine + targetChunk.length + between.length,
    previous,
  };
}

export type BlockLineRange = {
  startLine: number;
  endLine: number;
  indent: number;
  isList: boolean;
};

export type CollapsibleBlockRange = BlockLineRange & {
  level: number;
};

export function blockRangeForLines(lines: string[], lineNumber: number): BlockLineRange {
  const boundedLine = Math.min(Math.max(lineNumber, 1), lines.length);
  const current = listItemInfo(lines[boundedLine - 1] ?? "");
  if (!current) {
    return {
      startLine: boundedLine,
      endLine: boundedLine,
      indent: 0,
      isList: false,
    };
  }

  let endLine = boundedLine;
  for (let index = boundedLine + 1; index <= lines.length; index += 1) {
    const nextLine = lines[index - 1] ?? "";
    if (nextLine.trim() === "") {
      break;
    }

    const next = listItemInfo(nextLine);
    if (next && next.indent <= current.indent) {
      break;
    }

    endLine = index;
  }

  return {
    startLine: boundedLine,
    endLine,
    indent: current.indent,
    isList: true,
  };
}

export function collapsibleBlockRangeForLines(
  lines: string[],
  lineNumber: number,
): CollapsibleBlockRange | null {
  const range = blockRangeForLines(lines, lineNumber);
  const level = listBlockLevelForLine(lines, range.startLine);
  if (!range.isList || range.endLine <= range.startLine || level === null) {
    return null;
  }

  for (let currentLine = range.startLine + 1; currentLine <= range.endLine; currentLine += 1) {
    const child = listItemInfo(lines[currentLine - 1] ?? "");
    if (child && child.indent > range.indent) {
      return { ...range, level };
    }
  }

  return null;
}

export function listBlockLevelForLine(lines: string[], lineNumber: number) {
  const boundedLine = Math.min(Math.max(lineNumber, 1), lines.length);
  const current = listItemInfo(lines[boundedLine - 1] ?? "");
  if (!current) {
    return null;
  }

  const indents = listBlockIndents(lines);
  const index = indents.indexOf(current.indent);
  return index === -1 ? null : index + 1;
}

export function collapsibleBlockRangesBelowLevel(lines: string[], level: number) {
  const ranges: CollapsibleBlockRange[] = [];
  for (let lineNumber = 1; lineNumber <= lines.length; lineNumber += 1) {
    if (listBlockLevelForLine(lines, lineNumber) !== level) {
      continue;
    }

    const range = collapsibleBlockRangeForLines(lines, lineNumber);
    if (range) {
      ranges.push(range);
      lineNumber = range.endLine;
    }
  }

  return ranges;
}

export function blockEditingKeymap(
  taskStates = DEFAULT_TASK_STATES,
  onTaskStatusChange: (nextStatus: string) => void = () => {},
) {
  return Prec.highest(
    keymap.of([
      { key: "Enter", run: insertListBlock },
      { key: "Shift-Enter", run: insertBlockLineBreak },
      { key: "Backspace", run: deleteEmptyListBlock },
      { key: "Tab", run: indentSelectedBlocks },
      { key: "Shift-Tab", run: outdentSelectedBlocks },
      { key: "Mod-ArrowUp", run: moveCurrentBlock("up") },
      { key: "Mod-ArrowDown", run: moveCurrentBlock("down") },
      { key: "Mod-Enter", run: toggleCurrentTaskStatus(taskStates, onTaskStatusChange) },
    ]),
  );
}

function selectedBlockLineNumbers(state: EditorState) {
  const lines = documentLines(state);
  const lineNumbers = new Set<number>();

  for (const lineNumber of selectedLineNumbers(state)) {
    const range = blockRangeForLines(lines, lineNumber);
    for (let current = range.startLine; current <= range.endLine; current += 1) {
      lineNumbers.add(current);
    }
  }

  return [...lineNumbers].sort((left, right) => left - right);
}

function selectedLineNumbers(state: EditorState) {
  const lineNumbers = new Set<number>();

  for (const range of state.selection.ranges) {
    const fromLine = state.doc.lineAt(range.from).number;
    const toPosition = range.to > range.from ? range.to - 1 : range.to;
    const toLine = state.doc.lineAt(toPosition).number;

    for (let lineNumber = fromLine; lineNumber <= toLine; lineNumber += 1) {
      lineNumbers.add(lineNumber);
    }
  }

  return [...lineNumbers].sort((left, right) => left - right);
}

function previousSiblingRange(lines: string[], current: BlockLineRange) {
  if (!current.isList) {
    return current.startLine > 1
      ? blockRangeForLines(lines, current.startLine - 1)
      : null;
  }

  for (let lineNumber = current.startLine - 1; lineNumber >= 1; lineNumber -= 1) {
    const item = listItemInfo(lines[lineNumber - 1] ?? "");
    if (!item) {
      continue;
    }
    if (item.indent < current.indent) {
      return null;
    }
    if (item.indent === current.indent) {
      return blockRangeForLines(lines, lineNumber);
    }
  }

  return null;
}

function nextSiblingRange(lines: string[], current: BlockLineRange) {
  if (!current.isList) {
    return current.endLine < lines.length
      ? blockRangeForLines(lines, current.endLine + 1)
      : null;
  }

  for (let lineNumber = current.endLine + 1; lineNumber <= lines.length; lineNumber += 1) {
    const item = listItemInfo(lines[lineNumber - 1] ?? "");
    if (!item) {
      continue;
    }
    if (item.indent < current.indent) {
      return null;
    }
    if (item.indent === current.indent) {
      return blockRangeForLines(lines, lineNumber);
    }
  }

  return null;
}

function documentLines(state: EditorState) {
  const lines: string[] = [];
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    lines.push(state.doc.line(lineNumber).text);
  }
  return lines;
}

function lineColumnToPosition(lines: string[], lineNumber: number, column: number) {
  const boundedLine = Math.min(Math.max(lineNumber, 1), lines.length);
  let position = 0;

  for (let index = 1; index < boundedLine; index += 1) {
    position += (lines[index - 1]?.length ?? 0) + 1;
  }

  return position + Math.min(column, lines[boundedLine - 1]?.length ?? 0);
}

function listItemInfo(lineText: string) {
  const prefix = parseListItemPrefix(lineText);
  return prefix ? { indent: blockIndentWidth(prefix.indentation) } : null;
}

function listBlockIndents(lines: string[]) {
  return [
    ...new Set(
      lines
        .map((line) => listItemInfo(line)?.indent)
        .filter((indent): indent is number => typeof indent === "number"),
    ),
  ].sort((left, right) => left - right);
}

function orderedListItemInfo(lineText: string) {
  const prefix = parseListItemPrefix(lineText);
  const ordered = prefix ? /^(\d+)([.)])$/.exec(prefix.marker) : null;
  if (!prefix || !ordered) {
    return null;
  }

  return {
    indent: blockIndentWidth(prefix.indentation),
    number: Number(ordered[1]),
    delimiter: ordered[2],
    markerFrom: prefix.markerFrom,
    markerTo: prefix.markerTo,
  };
}

function orderedListRenumberChanges(
  state: EditorState,
  firstOriginalLineNumber: number,
  insertedPrefix: string,
): ChangeSpec[] {
  const inserted = orderedListItemInfo(insertedPrefix);
  if (!inserted) {
    return [];
  }

  const changes: ChangeSpec[] = [];
  let expectedNumber = inserted.number + 1;

  for (let lineNumber = firstOriginalLineNumber; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    if (line.text.trim() === "") {
      break;
    }

    const item = listItemInfo(line.text);
    if (!item) {
      if (blockIndentWidth(line.text) <= inserted.indent) {
        break;
      }
      continue;
    }

    if (item.indent < inserted.indent) {
      break;
    }

    if (item.indent > inserted.indent) {
      continue;
    }

    const ordered = orderedListItemInfo(line.text);
    if (!ordered || ordered.delimiter !== inserted.delimiter) {
      break;
    }

    changes.push({
      from: line.from + ordered.markerFrom,
      to: line.from + ordered.markerTo,
      insert: `${expectedNumber}${ordered.delimiter}`,
    });
    expectedNumber += 1;
  }

  return changes;
}

export function blockIndentWidth(lineText: string) {
  let indent = 0;
  for (const char of lineText) {
    if (char === " ") {
      indent += 1;
    } else if (char === "\t") {
      indent += 4;
    } else {
      break;
    }
  }

  return indent;
}

function nextListMarker(marker: string) {
  const ordered = /^(\d+)([.)])$/.exec(marker);
  if (!ordered) {
    return marker;
  }

  return `${Number(ordered[1]) + 1}${ordered[2]}`;
}
