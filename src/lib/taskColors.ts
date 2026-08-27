import type { TaskColorName, TaskStateColors } from "./types";

export const DEFAULT_TASK_STATE_COLORS: TaskStateColors = {
  TODO: "red",
  INPROGRESS: "blue",
  WAITING: "orange",
  DONE: "green",
};

const palette: Record<TaskColorName, { background: string; foreground: string }> = {
  red: { background: "#fee2e2", foreground: "#991b1b" },
  yellow: { background: "#fef3c7", foreground: "#854d0e" },
  green: { background: "#dcfce7", foreground: "#166534" },
  blue: { background: "#dbeafe", foreground: "#1d4ed8" },
  grey: { background: "#f1f5f9", foreground: "#475569" },
  orange: { background: "#ffedd5", foreground: "#9a3412" },
  pink: { background: "#f5e8ff", foreground: "#7e22ce" },
};

export function taskColorStyle(status: string, taskStateColors: TaskStateColors = {}) {
  const color = taskStateColors[status] ?? DEFAULT_TASK_STATE_COLORS[status] ?? "grey";
  const tokens = palette[color] ?? palette.grey;
  return `background-color: ${tokens.background}; color: ${tokens.foreground};`;
}
