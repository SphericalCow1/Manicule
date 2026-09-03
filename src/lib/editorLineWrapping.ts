import { EditorState, RangeSetBuilder, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";
import { listItemTextFrom, parseListItemPrefix } from "./markdownPatterns.js";

const listIndentWidth = 2;

export function listContinuationIndent(lineText: string) {
  const prefix = parseListItemPrefix(lineText);
  if (!prefix) {
    return 0;
  }

  const contentFrom = listItemTextFrom(prefix);
  return lineText.slice(contentFrom).length > 0 ? contentFrom : 0;
}

export function listIndentGuideOffsets(lineText: string) {
  const prefix = parseListItemPrefix(lineText);
  if (!prefix) {
    return [];
  }

  const indentation = visualIndentWidth(prefix.indentation);
  const offsets: number[] = [];
  for (let column = 0; column < indentation; column += listIndentWidth) {
    offsets.push(column + 0.5);
  }

  return offsets;
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
    const guideOffsets = listIndentGuideOffsets(line.text);
    if (indent === 0 && guideOffsets.length === 0) {
      continue;
    }

    const classes = [];
    const styles = [];
    if (indent > 0) {
      classes.push("cm-list-wrap-indent");
      styles.push(`--manicule-list-prefix-width: ${indent}ch`);
    }
    if (guideOffsets.length > 0) {
      classes.push("cm-list-indent-guides");
      styles.push(
        `--manicule-indent-guide-images: ${guideOffsets
          .map(() => "linear-gradient(var(--block-indent-guide), var(--block-indent-guide))")
          .join(", ")}`,
        `--manicule-indent-guide-positions: ${guideOffsets
          .map((offset) => `calc(8px + ${offset}ch) 0`)
          .join(", ")}`,
      );
    }

    builder.add(
      line.from,
      line.from,
      Decoration.line({
        class: classes.join(" "),
        attributes: { style: styles.join("; ") },
      }),
    );
  }

  return builder.finish();
}

function visualIndentWidth(indentation: string) {
  let width = 0;
  for (const character of indentation) {
    width += character === "\t" ? 4 : 1;
  }
  return width;
}
