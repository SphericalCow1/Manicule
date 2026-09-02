export type EditorContextMenuKind = "link" | "selection" | "task" | "text";

type SelectionRange = {
  from: number;
  to: number;
};

export function editorContextMenuKind(
  position: number,
  selection: SelectionRange,
  hasLink: boolean,
  hasTask: boolean,
): EditorContextMenuKind {
  if (hasLink) {
    return "link";
  }

  if (
    selection.to - selection.from > 1 &&
    position >= selection.from &&
    position < selection.to
  ) {
    return "selection";
  }

  return hasTask ? "task" : "text";
}
