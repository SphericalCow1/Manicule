export type KeyboardShortcut = {
  keys: string;
  description: string;
};

export const keyboardShortcuts: KeyboardShortcut[] = [
  { keys: "Enter", description: "Create a new block or list item" },
  { keys: "Shift+Enter", description: "Insert a visible line break within the current block" },
  { keys: "Tab", description: "Indent current or selected block" },
  { keys: "Shift+Tab", description: "Outdent current or selected block" },
  { keys: "Cmd/Ctrl+ArrowUp", description: "Move current block including child blocks up" },
  { keys: "Cmd/Ctrl+ArrowDown", description: "Move current block including child blocks down" },
  { keys: "Cmd/Ctrl+Enter", description: "Add or cycle task state" },
  { keys: "Cmd/Ctrl+1–4", description: "Collapse all blocks below that level" },
  { keys: "Cmd/Ctrl+Shift+E", description: "Expand all blocks" },
  { keys: "Cmd/Ctrl+Shift+T", description: "Toggle task overview" },
  { keys: "Cmd/Ctrl+Shift+L", description: "Toggle editor mode" },
  { keys: "Cmd/Ctrl+F", description: "Search in current file" },
  { keys: "Cmd/Ctrl+S", description: "Save current file" },
  { keys: "Cmd/Ctrl+Z", description: "Undo" },
  { keys: "Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y", description: "Redo" },
  { keys: "Cmd/Ctrl+Mouse Wheel", description: "Change UI zoom" },
];

export function collapseLevelFromShortcut(
  event: Pick<KeyboardEvent, "altKey" | "code" | "ctrlKey" | "isComposing" | "metaKey" | "shiftKey">,
) {
  if (
    event.altKey ||
    event.isComposing ||
    event.shiftKey ||
    (!event.metaKey && !event.ctrlKey)
  ) {
    return null;
  }

  const match = /^Digit([1-4])$/.exec(event.code);
  return match ? Number(match[1]) : null;
}
