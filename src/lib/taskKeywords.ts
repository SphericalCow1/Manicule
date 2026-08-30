import { listItemTextFrom, parseListItemPrefix } from "./markdownPatterns.js";

export const DEFAULT_TASK_STATES = ["TODO", "INPROGRESS", "WAITING", "DONE"];

export type TaskKeywordMatch = {
  from: number;
  to: number;
  status: string;
};

export type PriorityCookieMatch = {
  from: number;
  to: number;
  priority: string;
};

export type TaskPriorityChange = {
  from: number;
  to: number;
  insert: string;
};

export function renderTaskKeywords(source: string, taskStates = DEFAULT_TASK_STATES) {
  return source
    .split("\n")
    .map((line) => {
      const match = taskKeywordMatch(line, 0, taskStates);
      if (!match) {
        return line;
      }

      return `${line.slice(0, match.from)}**${match.status}**${line.slice(match.to)}`;
    })
    .join("\n");
}

export function taskKeywordMatch(
  lineText: string,
  lineFrom = 0,
  taskStates = DEFAULT_TASK_STATES,
): TaskKeywordMatch | null {
  const states = taskStates
    .map((state) => state.trim())
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  if (states.length === 0) {
    return null;
  }

  const prefix = parseListItemPrefix(lineText);
  if (!prefix) {
    return null;
  }

  const statusFrom = listItemTextFrom(prefix);
  const status = states.find((candidate) => {
    if (!lineText.startsWith(candidate, statusFrom)) {
      return false;
    }

    const remaining = lineText.slice(statusFrom + candidate.length);
    return remaining === "" || remaining.startsWith("[#") || /^\s/.test(remaining);
  });
  if (!status) {
    return null;
  }

  const from = lineFrom + statusFrom;

  return {
    from,
    to: from + status.length,
    status,
  };
}

export function priorityCookieMatch(
  lineText: string,
  lineFrom = 0,
  taskStates = DEFAULT_TASK_STATES,
): PriorityCookieMatch | null {
  const taskMatch = taskKeywordMatch(lineText, lineFrom, taskStates);
  if (!taskMatch) {
    return null;
  }

  const offset = taskMatch.to - lineFrom;
  const match = /^\s*\[#([A-Za-z0-9_-]+)\](?=\s|$)/.exec(lineText.slice(offset));
  if (!match) {
    return null;
  }

  const priorityStart = offset + match[0].indexOf("[#");

  return {
    from: lineFrom + priorityStart,
    to: lineFrom + priorityStart + match[0].trimStart().length,
    priority: match[1],
  };
}

export function taskPriorityChange(
  lineText: string,
  lineFrom = 0,
  nextPriority: string | null,
  taskStates = DEFAULT_TASK_STATES,
): TaskPriorityChange | null {
  const taskMatch = taskKeywordMatch(lineText, lineFrom, taskStates);
  if (!taskMatch) {
    return null;
  }

  const priorityMatch = priorityCookieMatch(lineText, lineFrom, taskStates);
  if (!priorityMatch) {
    return nextPriority
      ? {
          from: taskMatch.to,
          to: taskMatch.to,
          insert: ` [#${nextPriority}]`,
        }
      : null;
  }

  if (!nextPriority) {
    const gapStart = taskMatch.to - lineFrom;
    const gapEnd = priorityMatch.from - lineFrom;
    const gap = lineText.slice(gapStart, gapEnd);

    return {
      from: gap.trim() ? priorityMatch.from : taskMatch.to,
      to: priorityMatch.to,
      insert: "",
    };
  }

  return {
    from: priorityMatch.from,
    to: priorityMatch.to,
    insert: `[#${nextPriority}]`,
  };
}

export function isDoneTaskState(status: string, taskStates = DEFAULT_TASK_STATES) {
  return status === taskStates[taskStates.length - 1];
}
