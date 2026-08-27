export type KeyboardShortcut = {
  keys: string;
  description: string;
};

export const keyboardShortcuts: KeyboardShortcut[] = [
  { keys: "Enter", description: "Create a new block or list item" },
  { keys: "Tab", description: "Indent current or selected block" },
  { keys: "Shift+Tab", description: "Outdent current or selected block" },
  { keys: "Cmd/Ctrl+ArrowUp", description: "Move current block including child blocks up" },
  { keys: "Cmd/Ctrl+ArrowDown", description: "Move current block including child blocks down" },
  { keys: "Cmd/Ctrl+Enter", description: "Add or cycle task state" },
  { keys: "Cmd/Ctrl+Shift+E", description: "Show editor" },
  { keys: "Cmd/Ctrl+Shift+T", description: "Show task overview" },
  { keys: "Cmd/Ctrl+Shift+L", description: "Switch to live preview" },
  { keys: "Cmd/Ctrl+Shift+M", description: "Switch to source markdown" },
  { keys: "Cmd/Ctrl+F", description: "Search in current file" },
  { keys: "Cmd/Ctrl+S", description: "Save current file" },
  { keys: "Cmd/Ctrl+Z", description: "Undo" },
  { keys: "Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y", description: "Redo" },
  { keys: "Cmd/Ctrl+Mouse Wheel", description: "Change UI zoom" },
];
