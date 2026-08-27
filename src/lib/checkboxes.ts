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

const checkboxLinePattern = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\]/;

export function checkboxLines(content: string) {
  return content
    .split(/\r?\n/)
    .map((line, index) => ({ line, lineNumber: index + 1 }))
    .filter(({ line }) => checkboxLinePattern.test(line))
    .map(({ line, lineNumber }) => ({
      lineNumber,
      checked: checkboxLinePattern.exec(line)?.[2].toLowerCase() === "x",
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
  const match = checkboxLinePattern.exec(line);
  if (!match) {
    return { changed: false, content, checked: null };
  }

  const checked = match[2].toLowerCase() !== "x";
  const replacement = `${match[1]}[${checked ? "x" : " "}]`;
  const updatedLine = `${replacement}${line.slice(match[0].length)}`;

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
  const match = checkboxLinePattern.exec(line);
  if (!match) {
    return { changed: false, content, checked: null };
  }

  const currentChecked = match[2].toLowerCase() === "x";
  if (currentChecked === checked) {
    return { changed: false, content, checked };
  }

  const replacement = `${match[1]}[${checked ? "x" : " "}]`;
  const updatedLine = `${replacement}${line.slice(match[0].length)}`;

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
