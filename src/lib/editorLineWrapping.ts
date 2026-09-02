import { EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { listItemTextFrom, parseListItemPrefix } from "./markdownPatterns.js";

export function listContinuationIndent(lineText: string) {
  const prefix = parseListItemPrefix(lineText);
  if (!prefix) {
    return 0;
  }

  const contentFrom = listItemTextFrom(prefix);
  return lineText.slice(contentFrom).length > 0 ? contentFrom : 0;
}

export const listWrapIndentExtension = StateField.define<DecorationSet>({
  create(state) {
    return buildListWrapIndentDecorations(state);
  },
  update(decorations, transaction) {
    if (transaction.docChanged) {
      return buildListWrapIndentDecorations(transaction.state);
    }

    return decorations.map(transaction.changes);
  },
  provide: (field) => EditorView.decorations.from(field),
});

function buildListWrapIndentDecorations(state: EditorState) {
  const builder = new RangeSetBuilder<Decoration>();

  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    const line = state.doc.line(lineNumber);
    const indent = listContinuationIndent(line.text);
    if (indent === 0) {
      continue;
    }

    builder.add(
      line.from,
      line.from,
      Decoration.line({
        class: "cm-list-wrap-indent",
        attributes: { style: `--mentinote-list-prefix-width: ${indent}ch` },
      }),
    );
  }

  return builder.finish();
}
