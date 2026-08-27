import type { BacklinkView } from "./types";
import {
  DEFAULT_TASK_STATES,
  isDoneTaskState,
  taskKeywordMatch,
} from "./taskKeywords.js";

type BacklinkFilterOptions = {
  openTasksOnly?: boolean;
  taskStates?: string[];
};

export function filterBacklinks(
  backlinks: BacklinkView[],
  filter = "",
  options: BacklinkFilterOptions = {},
) {
  const normalizedFilter = filter.trim().toLowerCase();
  const taskStates = options.taskStates?.length ? options.taskStates : DEFAULT_TASK_STATES;

  return backlinks.filter(
    (backlink) =>
      matchesFilter(backlink, normalizedFilter) &&
      (!options.openTasksOnly || hasOpenTask(backlink.blockMarkdown, taskStates)),
  );
}

export function shortBacklinkContext(markdown: string) {
  return markdown
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0) ?? "";
}

function matchesFilter(backlink: BacklinkView, normalizedFilter: string) {
  if (!normalizedFilter) {
    return true;
  }

  return (
    backlink.sourceTitle.toLowerCase().includes(normalizedFilter) ||
    backlink.sourcePath.toLowerCase().includes(normalizedFilter) ||
    backlink.sourceHeadings.some((heading) => heading.toLowerCase().includes(normalizedFilter)) ||
    backlink.blockMarkdown.toLowerCase().includes(normalizedFilter)
  );
}

function hasOpenTask(markdown: string, taskStates: string[]) {
  return markdown.split("\n").some((line) => {
    const match = taskKeywordMatch(line, 0, taskStates);
    return match ? !isDoneTaskState(match.status, taskStates) : false;
  });
}
