import type { TaskColorName, TaskStateColors } from "./types";

export const DEFAULT_TASK_STATE_COLORS: TaskStateColors = {
  TODO: "red",
  INPROGRESS: "blue",
  WAITING: "orange",
  DONE: "green",
};

const taskColorNames = new Set<TaskColorName>([
  "red",
  "yellow",
  "green",
  "blue",
  "grey",
  "orange",
  "pink",
]);

export function taskColorStyle(status: string, taskStateColors: TaskStateColors = {}) {
  const color = taskStateColors[status] ?? DEFAULT_TASK_STATE_COLORS[status] ?? "grey";
  const tokenColor = taskColorNames.has(color) ? color : "grey";
  return `background-color: var(--task-color-${tokenColor}-bg); color: var(--task-color-${tokenColor}-text);`;
}
