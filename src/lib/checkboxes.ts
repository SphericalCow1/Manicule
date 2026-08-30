import { parseCheckboxListItem } from "./markdownPatterns.js";

export type CheckboxToggleResult =
  | {
      changed: true;
      content: string;
      checked: boolean;
    }
  | {
      changed: false;
      content: string;
      checked: boolean | null;
    };

export function checkboxLines(content: string) {
  return content
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .map(({ line, lineNumber }) => ({ lineNumber, parsed: parseCheckboxListItem(line) }))
    .filter(({ parsed }) => parsed !== null)
    .map(({ lineNumber, parsed }) => ({
      lineNumber,
      checked: parsed!.checkbox.checked,
    }));
}

export function toggleCheckboxLine(content: string, lineNumber: number): CheckboxToggleResult {
  if (lineNumber < 1) {
    return { changed: false, content, checked: null };
  }

  const lineRanges = contentLineRanges(content);
  const range = lineRanges[lineNumber - 1];
  if (!range) {
    return { changed: false, content, checked: null };
  }

  const line = content.slice(range.from, range.to);
  const parsed = parseCheckboxListItem(line);
  if (!parsed) {
    return { changed: false, content, checked: null };
  }

  const checked = !parsed.checkbox.checked;
  const updatedLine = `${line.slice(0, parsed.checkbox.from)}[${checked ? "x" : " "}]${line.slice(parsed.checkbox.to)}`;

  return {
    changed: true,
    content: `${content.slice(0, range.from)}${updatedLine}${content.slice(range.to)}`,
    checked,
  };
}

export function setCheckboxLine(
  content: string,
  lineNumber: number,
  checked: boolean,
): CheckboxToggleResult {
  if (lineNumber < 1) {
    return { changed: false, content, checked: null };
  }

  const lineRanges = contentLineRanges(content);
  const range = lineRanges[lineNumber - 1];
  if (!range) {
    return { changed: false, content, checked: null };
  }

  const line = content.slice(range.from, range.to);
  const parsed = parseCheckboxListItem(line);
  if (!parsed) {
    return { changed: false, content, checked: null };
  }

  const currentChecked = parsed.checkbox.checked;
  if (currentChecked === checked) {
    return { changed: false, content, checked };
  }

  const updatedLine = `${line.slice(0, parsed.checkbox.from)}[${checked ? "x" : " "}]${line.slice(parsed.checkbox.to)}`;

  return {
    changed: true,
    content: `${content.slice(0, range.from)}${updatedLine}${content.slice(range.to)}`,
    checked,
  };
}

function contentLineRanges(content: string) {
  const ranges: Array<{ from: number; to: number }> = [];
  let lineStart = 0;

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] !== "\n") {
      continue;
    }

    const lineEnd = index > lineStart && content[index - 1] === "\r" ? index - 1 : index;
    ranges.push({ from: lineStart, to: lineEnd });
    lineStart = index + 1;
  }

  ranges.push({ from: lineStart, to: content.length });
  return ranges;
}
