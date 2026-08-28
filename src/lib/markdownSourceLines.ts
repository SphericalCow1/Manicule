export const SOURCE_LINE_RENDER_TOKEN_RULES = [
  "heading_open",
  "list_item_open",
  "paragraph_open",
  "td_open",
  "th_open",
  "tr_open",
];
export const SOURCE_LINE_CONTEXT_SELECTOR = "[data-source-line], [data-task-line], [data-line]";

export function sourceLineForLocalLine(localLine: number, sourceLineNumbers: number[] = []) {
  return sourceLineNumbers[localLine - 1] ?? localLine;
}

export function sourceLineSelectorForLine(line: number) {
  return `[data-source-line="${line}"], [data-task-line="${line}"], [data-line="${line}"]`;
}

export function sourceLineFromContextMenuTarget(target: EventTarget | null) {
  const element = target instanceof HTMLElement ? target : null;
  const sourceLineElement = element?.closest<HTMLElement>(SOURCE_LINE_CONTEXT_SELECTOR);
  const line = Number(
    sourceLineElement?.dataset.sourceLine ??
      sourceLineElement?.dataset.taskLine ??
      sourceLineElement?.dataset.line,
  );

  return Number.isInteger(line) && line > 0 ? line : null;
}
