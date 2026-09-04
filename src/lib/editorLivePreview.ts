import { EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import {
  DEFAULT_TASK_STATES,
  priorityCookieMatch,
  taskKeywordMatch,
} from "./taskKeywords.js";
import { taskColorStyle } from "./taskColors.js";
import { wikiLinkColorStyle } from "./folderColors.js";
import { parseCheckboxListItem } from "./markdownPatterns.js";
import { wikiLinkDisplayLabel } from "./wikiLinks.js";
import type { FolderColors, PageSummary, TaskStateColors } from "./types.js";

export type EditorMode = "source" | "live-preview";

export type WikiLinkAtPosition = {
  from: number;
  to: number;
  target: string;
  label: string;
};

export type TaskKeywordAtPosition = {
  from: number;
  to: number;
  status: string;
};

type PreviewDecoration = {
  from: number;
  to: number;
  decoration: Decoration;
};

type CheckboxAtPosition = {
  from: number;
  to: number;
  checked: boolean;
};

const hiddenMarkdown = Decoration.replace({});
const strongText = Decoration.mark({ class: "cm-live-strong" });
const emphasisText = Decoration.mark({ class: "cm-live-emphasis" });
const taskPriority = Decoration.mark({ class: "cm-live-priority" });
const wikiLinkMatcher = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]|\(\(([^)|]+)(?:\|([^)]+))?\)\)/g;

export function livePreviewExtension(
  taskStates = DEFAULT_TASK_STATES,
  taskStateColors: TaskStateColors = {},
  pages: PageSummary[] = [],
  folderColors: FolderColors = {},
) {
  return [livePreviewField(taskStates, taskStateColors, pages, folderColors), livePreviewTheme];
}

export function previewDecorationsForLine(
  lineText: string,
  lineFrom = 0,
  taskStates = DEFAULT_TASK_STATES,
  taskStateColors: TaskStateColors = {},
  pages: PageSummary[] = [],
  folderColors: FolderColors = {},
): PreviewDecoration[] {
  const decorations: PreviewDecoration[] = [];

  if (isTableRow(lineText)) {
    return decorations;
  }

  addHeadingDecorations(lineText, lineFrom, decorations);
  addCheckboxDecorations(lineText, lineFrom, decorations);
  addTaskDecorations(lineText, lineFrom, decorations, taskStates, taskStateColors);
  addWikiLinkDecorations(lineText, lineFrom, decorations, pages, folderColors);
  addStrongDecorations(lineText, lineFrom, decorations);
  addEmphasisDecorations(lineText, lineFrom, decorations);

  return decorations.sort((left, right) => left.from - right.from || left.to - right.to);
}

export function wikiLinkAtPosition(
  lineText: string,
  lineFrom: number,
  position: number,
): WikiLinkAtPosition | null {
  const linePosition = position - lineFrom;
  for (const match of lineText.matchAll(wikiLinkMatcher)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (linePosition < start || linePosition > end) {
      continue;
    }

    const target = (match[1] ?? match[3]).trim();
    const alias = (match[2] ?? match[4])?.trim();
    return {
      from: lineFrom + start,
      to: lineFrom + end,
      target,
      label: alias || target,
    };
  }

  return null;
}

export function wikiLinkAtDocumentPosition(state: EditorState, position: number) {
  if (isPositionInsideFencedCode(state, position)) {
    return null;
  }

  const line = state.doc.lineAt(position);
  return wikiLinkAtPosition(line.text, line.from, position);
}

export function taskKeywordAtDocumentPosition(
  state: EditorState,
  position: number,
  taskStates = DEFAULT_TASK_STATES,
): TaskKeywordAtPosition | null {
  if (isPositionInsideFencedCode(state, position)) {
    return null;
  }

  const line = state.doc.lineAt(position);
  const match = taskKeywordMatch(line.text, line.from, taskStates);
  if (!match) {
    return null;
  }

  if (position >= match.from && position <= match.to) {
    return match;
  }

  const priority = priorityCookieMatch(line.text, line.from, taskStates);
  if (priority && position >= priority.from && position <= priority.to) {
    return match;
  }

  return null;
}

export function checkboxAtDocumentPosition(
  state: EditorState,
  position: number,
): CheckboxAtPosition | null {
  if (isPositionInsideFencedCode(state, position)) {
    return null;
  }

  const line = state.doc.lineAt(position);
  return checkboxAtLinePosition(line.text, line.from, position);
}

function checkboxAtLinePosition(
  lineText: string,
  lineFrom: number,
  position: number,
): CheckboxAtPosition | null {
  const parsed = parseCheckboxListItem(lineText);
  if (!parsed) {
    return null;
  }

  const from = lineFrom + parsed.checkbox.from;
  const to = lineFrom + parsed.checkbox.to;
  if (position < from || position > to) {
    return null;
  }

  return {
    from,
    to,
    checked: parsed.checkbox.checked,
  };
}

function livePreviewField(
  taskStates: string[],
  taskStateColors: TaskStateColors,
  pages: PageSummary[],
  folderColors: FolderColors,
) {
  return StateField.define<DecorationSet>({
    create(state) {
      return buildLivePreviewDecorations(state, taskStates, taskStateColors, pages, folderColors);
    },
    update(decorations, transaction) {
      if (transaction.docChanged || transaction.selection) {
        return buildLivePreviewDecorations(
          transaction.state,
          taskStates,
          taskStateColors,
          pages,
          folderColors,
        );
      }

      return decorations.map(transaction.changes);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

const livePreviewTheme = EditorView.baseTheme({
  ".cm-live-heading-1": {
    fontSize: "1.45em",
    fontWeight: "700",
    lineHeight: "1.8",
  },
  ".cm-live-heading-2": {
    fontSize: "1.25em",
    fontWeight: "700",
    lineHeight: "1.7",
  },
  ".cm-live-heading-3": {
    fontSize: "1.1em",
    fontWeight: "700",
    lineHeight: "1.65",
  },
  ".cm-live-wiki-link": {
    color: "var(--wiki-link-text)",
    backgroundColor: "var(--wiki-link-bg)",
    borderBottom: "1px solid var(--wiki-link-border)",
    borderRadius: "4px",
    padding: "0 2px",
  },
  ".cm-live-strong": {
    fontWeight: "700",
  },
  ".cm-live-emphasis": {
    fontStyle: "italic",
  },
  ".cm-live-checkbox": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    boxSizing: "border-box",
    width: "0.92em",
    height: "0.92em",
    marginRight: "0.35em",
    border: "1px solid var(--editor-checkbox-border)",
    borderRadius: "3px",
    lineHeight: "1",
    verticalAlign: "-0.08em",
  },
  ".cm-live-checkbox-checked": {
    borderColor: "var(--editor-checkbox-checked-text)",
    backgroundColor: "var(--editor-checkbox-checked-bg)",
  },
  ".cm-live-checkbox-check": {
    position: "absolute",
    left: "50%",
    top: "43%",
    width: "0.3em",
    height: "0.52em",
    borderRight: "2px solid var(--editor-checkbox-checked-text)",
    borderBottom: "2px solid var(--editor-checkbox-checked-text)",
    boxSizing: "border-box",
    transform: "translate(-50%, -50%) rotate(45deg)",
    transformOrigin: "center",
  },
  ".cm-live-task": {
    borderRadius: "4px",
    padding: "0 4px",
    fontSize: "0.92em",
    fontWeight: "700",
  },
  ".cm-live-task-todo": {
    color: "var(--editor-task-todo-text)",
    backgroundColor: "var(--editor-task-todo-bg)",
  },
  ".cm-live-task-done": {
    color: "var(--editor-task-done-text)",
    backgroundColor: "var(--editor-task-done-bg)",
  },
  ".cm-live-priority": {
    color: "var(--editor-priority-text)",
    backgroundColor: "var(--editor-priority-bg)",
    borderRadius: "4px",
    padding: "0 4px",
    fontSize: "0.92em",
    fontWeight: "700",
  },
});

function buildLivePreviewDecorations(
  state: EditorState,
  taskStates: string[],
  taskStateColors: TaskStateColors,
  pages: PageSummary[],
  folderColors: FolderColors,
) {
  const builder = new RangeSetBuilder<Decoration>();
  const activeLines = activeBlockLineNumbers(state);
  let inFencedCode = false;

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const trimmed = line.text.trimStart();
    const startsFence = trimmed.startsWith("```") || trimmed.startsWith("~~~");

    if (startsFence) {
      inFencedCode = !inFencedCode;
      continue;
    }

    if (inFencedCode || activeLines.has(lineNumber)) {
      continue;
    }

    const lineDecorations = previewDecorationsForLine(
      line.text,
      line.from,
      taskStates,
      taskStateColors,
      pages,
      folderColors,
    );
    for (const { from, to, decoration } of lineDecorations) {
      builder.add(from, to, decoration);
    }
  }

  return builder.finish();
}

export function activeBlockLineNumbers(state: EditorState) {
  const lines = new Set<number>();

  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let line = startLine; line <= endLine; line += 1) {
      lines.add(line);
    }
  }

  return new Set([...lines].sort((left, right) => left - right));
}

function isPositionInsideFencedCode(state: EditorState, position: number) {
  const currentLine = state.doc.lineAt(position).number;
  let inFencedCode = false;

  for (let lineNumber = 1; lineNumber <= currentLine; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const trimmed = line.text.trimStart();
    const startsFence = trimmed.startsWith("```") || trimmed.startsWith("~~~");

    if (!startsFence) {
      continue;
    }

    if (lineNumber === currentLine) {
      return false;
    }

    inFencedCode = !inFencedCode;
  }

  return inFencedCode;
}

function isTableRow(lineText: string) {
  const trimmed = lineText.trim();
  return trimmed.startsWith("|") && trimmed.endsWith("|") && trimmed.includes("|", 1);
}

function addHeadingDecorations(
  lineText: string,
  lineFrom: number,
  decorations: PreviewDecoration[],
) {
  const match = /^(#{1,3})\s+/.exec(lineText);
  if (!match) {
    return;
  }

  decorations.push({
    from: lineFrom,
    to: lineFrom,
    decoration: Decoration.line({ class: `cm-live-heading-${match[1].length}` }),
  });
  decorations.push({
    from: lineFrom,
    to: lineFrom + match[0].length,
    decoration: hiddenMarkdown,
  });
}

function addTaskDecorations(
  lineText: string,
  lineFrom: number,
  decorations: PreviewDecoration[],
  taskStates: string[],
  taskStateColors: TaskStateColors,
) {
  const match = taskKeywordMatch(lineText, lineFrom, taskStates);
  if (!match) {
    return;
  }

  decorations.push({
    from: match.from,
    to: match.to,
    decoration: Decoration.mark({
      class: `cm-live-task cm-live-task-${safeTaskClass(match.status)}`,
      attributes: { style: taskColorStyle(match.status, taskStateColors) },
    }),
  });

  const priority = priorityCookieMatch(lineText, lineFrom, taskStates);
  if (priority) {
    decorations.push({
      from: priority.from,
      to: priority.to,
      decoration: taskPriority,
    });
  }
}

function safeTaskClass(status: string) {
  return status.toLowerCase().replace(/[^a-z0-9_-]/g, "-");
}

function addCheckboxDecorations(
  lineText: string,
  lineFrom: number,
  decorations: PreviewDecoration[],
) {
  const parsed = parseCheckboxListItem(lineText);
  if (!parsed) {
    return;
  }

  const markerStart = parsed.checkbox.from;
  const markerEnd = parsed.checkbox.to;
  const checked = parsed.checkbox.checked;

  decorations.push({
    from: lineFrom + markerStart,
    to: lineFrom + markerEnd,
    decoration: Decoration.replace({ widget: new CheckboxWidget(checked) }),
  });
}

function addWikiLinkDecorations(
  lineText: string,
  lineFrom: number,
  decorations: PreviewDecoration[],
  pages: PageSummary[],
  folderColors: FolderColors,
) {
  for (const match of lineText.matchAll(wikiLinkMatcher)) {
    const start = match.index ?? 0;
    const full = match[0];
    const target = match[1] ?? match[3];
    const alias = match[2] ?? match[4];
    const decoration = Decoration.mark({
      class: "cm-live-wiki-link",
      attributes: { style: wikiLinkColorStyle(target, pages, folderColors) },
    });

    if (alias) {
      const aliasStart = start + 2 + target.length + 1;
      decorations.push({
        from: lineFrom + start,
        to: lineFrom + aliasStart,
        decoration: hiddenMarkdown,
      });
      decorations.push({
        from: lineFrom + aliasStart,
        to: lineFrom + aliasStart + alias.length,
        decoration,
      });
      decorations.push({
        from: lineFrom + start + full.length - 2,
        to: lineFrom + start + full.length,
        decoration: hiddenMarkdown,
      });
    } else {
      const targetStart = start + 2;
      const label = wikiLinkDisplayLabel(target, pages);
      decorations.push({
        from: lineFrom + start,
        to: lineFrom + targetStart,
        decoration: hiddenMarkdown,
      });
      decorations.push({
        from: lineFrom + targetStart,
        to: lineFrom + targetStart + target.length,
        decoration:
          label === target
            ? decoration
            : Decoration.replace({
                widget: new WikiLinkLabelWidget(label, wikiLinkColorStyle(target, pages, folderColors)),
              }),
      });
      decorations.push({
        from: lineFrom + start + full.length - 2,
        to: lineFrom + start + full.length,
        decoration: hiddenMarkdown,
      });
    }
  }
}

function addStrongDecorations(
  lineText: string,
  lineFrom: number,
  decorations: PreviewDecoration[],
) {
  const matcher = /\*\*([^*\n]+)\*\*/g;

  for (const match of lineText.matchAll(matcher)) {
    const start = match.index ?? 0;
    const contentStart = start + 2;
    const contentEnd = contentStart + match[1].length;

    decorations.push({
      from: lineFrom + start,
      to: lineFrom + contentStart,
      decoration: hiddenMarkdown,
    });
    decorations.push({
      from: lineFrom + contentStart,
      to: lineFrom + contentEnd,
      decoration: strongText,
    });
    decorations.push({
      from: lineFrom + contentEnd,
      to: lineFrom + contentEnd + 2,
      decoration: hiddenMarkdown,
    });
  }
}

function addEmphasisDecorations(
  lineText: string,
  lineFrom: number,
  decorations: PreviewDecoration[],
) {
  for (const match of emphasisSpans(lineText)) {
    const contentStart = match.start + 1;
    const contentEnd = match.end;

    decorations.push({
      from: lineFrom + match.start,
      to: lineFrom + contentStart,
      decoration: hiddenMarkdown,
    });
    decorations.push({
      from: lineFrom + contentStart,
      to: lineFrom + contentEnd,
      decoration: emphasisText,
    });
    decorations.push({
      from: lineFrom + contentEnd,
      to: lineFrom + contentEnd + 1,
      decoration: hiddenMarkdown,
    });
  }
}

type EmphasisSpan = {
  start: number;
  end: number;
};

export function emphasisSpans(lineText: string): EmphasisSpan[] {
  const spans: EmphasisSpan[] = [];

  for (let start = 0; start < lineText.length; start += 1) {
    const marker = lineText[start];
    if (marker !== "*" && marker !== "_") {
      continue;
    }
    if (!canOpenEmphasis(lineText, start, marker)) {
      continue;
    }

    const end = closingEmphasisIndex(lineText, start + 1, marker);
    if (end === -1) {
      continue;
    }

    spans.push({ start, end });
    start = end;
  }

  return spans;
}

function closingEmphasisIndex(lineText: string, from: number, marker: string) {
  for (let end = from; end < lineText.length; end += 1) {
    if (lineText[end] === marker && canCloseEmphasis(lineText, end, marker)) {
      return end;
    }
  }

  return -1;
}

function canOpenEmphasis(lineText: string, index: number, marker: string) {
  return (
    !isPartOfStrongDelimiter(lineText, index, marker) &&
    !isWhitespace(lineText[index + 1]) &&
    lineText[index + 1] !== marker
  );
}

function canCloseEmphasis(lineText: string, index: number, marker: string) {
  return (
    !isPartOfStrongDelimiter(lineText, index, marker) &&
    !isWhitespace(lineText[index - 1]) &&
    lineText[index - 1] !== marker
  );
}

function isPartOfStrongDelimiter(lineText: string, index: number, marker: string) {
  return lineText[index - 1] === marker || lineText[index + 1] === marker;
}

function isWhitespace(char: string | undefined) {
  return char === undefined || /\s/.test(char);
}

class CheckboxWidget extends WidgetType {
  constructor(private readonly checked: boolean) {
    super();
  }

  toDOM() {
    const checkbox = document.createElement("span");
    checkbox.className = this.checked
      ? "cm-live-checkbox cm-live-checkbox-checked"
      : "cm-live-checkbox";
    checkbox.setAttribute("aria-hidden", "true");
    if (this.checked) {
      checkbox.appendChild(liveCheckboxCheckElement());
    }
    return checkbox;
  }
}

export function liveCheckboxCheckElement() {
  const check = document.createElement("span");
  check.className = liveCheckboxCheckClass();
  return check;
}

export function liveCheckboxCheckClass() {
  return "cm-live-checkbox-check";
}

class WikiLinkLabelWidget extends WidgetType {
  constructor(
    private readonly label: string,
    private readonly style: string,
  ) {
    super();
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-live-wiki-link";
    span.setAttribute("style", this.style);
    span.textContent = this.label;
    return span;
  }
}
