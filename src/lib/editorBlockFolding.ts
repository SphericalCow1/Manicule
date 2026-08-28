import { ChangeDesc, EditorState, StateEffect, StateField } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  GutterMarker,
  gutter,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import {
  blockRangeForLines,
  collapsibleBlockRangeForLines,
  collapsibleBlockRangesBelowLevel,
  listBlockLevelForLine,
} from "./editorBlockCommands.js";

type FoldedRange = {
  from: number;
  to: number;
};

export const toggleBlockFoldEffect = StateEffect.define<number>();
export const collapseBlockEffect = StateEffect.define<number>();
export const expandBlockEffect = StateEffect.define<number>();
export const collapseBelowLevelEffect = StateEffect.define<number>();
export const expandAllBlockFoldsEffect = StateEffect.define<void>();

const foldedBlockRangesField = StateField.define<FoldedRange[]>({
  create() {
    return [];
  },
  update(foldedRanges, transaction) {
    let next = remapFoldedRanges(foldedRanges, transaction.changes);

    for (const effect of transaction.effects) {
      if (effect.is(toggleBlockFoldEffect)) {
        next = toggleFoldedBlock(transaction.state, next, effect.value);
      } else if (effect.is(collapseBlockEffect)) {
        next = collapseFoldedBlock(transaction.state, next, effect.value);
      } else if (effect.is(expandBlockEffect)) {
        next = expandFoldedBlock(transaction.state, next, effect.value);
      } else if (effect.is(collapseBelowLevelEffect)) {
        next = collapseFoldedBlocksBelowLevel(transaction.state, effect.value);
      } else if (effect.is(expandAllBlockFoldsEffect)) {
        next = [];
      }
    }

    return next;
  },
});

const foldedBlockDecorationsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, transaction) {
    if (!transaction.docChanged && !transaction.effects.some(isBlockFoldEffect)) {
      return decorations;
    }

    return Decoration.set(
      transaction.state.field(foldedBlockRangesField).map((range) =>
        Decoration.replace({ block: true }).range(range.from, range.to),
      ),
      true,
    );
  },
  provide: (field) => EditorView.decorations.from(field),
});

class BlockFoldMarker extends GutterMarker {
  constructor(private readonly folded: boolean) {
    super();
  }

  toDOM() {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "cm-block-fold-marker";
    marker.textContent = this.folded ? "▸" : "▾";
    marker.title = this.folded ? "Expand block" : "Collapse block";
    marker.ariaLabel = marker.title;
    marker.tabIndex = -1;
    marker.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    return marker;
  }
}

const expandedMarker = new BlockFoldMarker(false);
const collapsedMarker = new BlockFoldMarker(true);

export const blockFoldingExtension = [
  foldedBlockRangesField,
  foldedBlockDecorationsField,
  gutter({
    class: "cm-block-fold-gutter",
    lineMarker(view, line) {
      const lineNumber = view.state.doc.lineAt(line.from).number;
      if (!collapsibleBlockRangeForStateLine(view.state, lineNumber)) {
        return null;
      }

      return foldedBlockAtLine(view.state, lineNumber) ? collapsedMarker : expandedMarker;
    },
    lineMarkerChange(update) {
      return update.docChanged || update.transactions.some(transactionHasBlockFoldEffect);
    },
  }),
];

export function toggleBlockFold(view: EditorView, lineNumber: number) {
  view.dispatch({ effects: toggleBlockFoldEffect.of(lineNumber) });
}

export function collapseBlock(view: EditorView, lineNumber: number) {
  view.dispatch({ effects: collapseBlockEffect.of(lineNumber) });
}

export function expandBlock(view: EditorView, lineNumber: number) {
  view.dispatch({ effects: expandBlockEffect.of(lineNumber) });
}

export function collapseAllBlocksBelowLevel(view: EditorView, level: number) {
  view.dispatch({ effects: collapseBelowLevelEffect.of(level) });
}

export function expandAllBlockFolds(view: EditorView) {
  view.dispatch({ effects: expandAllBlockFoldsEffect.of() });
}

export function foldedBlockAtLine(state: EditorState, lineNumber: number) {
  return foldedRangeForBlock(state, lineNumber) !== null;
}

export function collapsibleBlockAtLine(state: EditorState, lineNumber: number) {
  return collapsibleBlockRangeForStateLine(state, lineNumber) !== null;
}

export function foldableBlockLevelAtLine(state: EditorState, lineNumber: number) {
  return listBlockLevelForLine(documentLines(state), lineNumber);
}

export function ensureLineVisible(view: EditorView, lineNumber: number) {
  const foldedRange = foldedRangeContainingLine(view.state, lineNumber);
  if (!foldedRange) {
    return;
  }

  view.dispatch({ effects: expandBlockEffect.of(foldedRange.parentLineNumber) });
}

function isBlockFoldEffect(effect: StateEffect<unknown>) {
  return (
    effect.is(toggleBlockFoldEffect) ||
    effect.is(collapseBlockEffect) ||
    effect.is(expandBlockEffect) ||
    effect.is(collapseBelowLevelEffect) ||
    effect.is(expandAllBlockFoldsEffect)
  );
}

function transactionHasBlockFoldEffect(update: ViewUpdate["transactions"][number]) {
  return update.effects.some(isBlockFoldEffect);
}

function remapFoldedRanges(foldedRanges: FoldedRange[], changes: ChangeDesc) {
  return foldedRanges.flatMap((range) => {
    const from = changes.mapPos(range.from, 1);
    const to = changes.mapPos(range.to, -1);
    return from < to ? [{ from, to }] : [];
  });
}

function toggleFoldedBlock(state: EditorState, foldedRanges: FoldedRange[], lineNumber: number) {
  return foldedBlockAtLine(state, lineNumber)
    ? expandFoldedBlock(state, foldedRanges, lineNumber)
    : collapseFoldedBlock(state, foldedRanges, lineNumber);
}

function collapseFoldedBlock(
  state: EditorState,
  foldedRanges: FoldedRange[],
  lineNumber: number,
) {
  const range = foldedRangeForBlockLine(state, lineNumber);
  if (!range) {
    return foldedRanges;
  }

  return normalizeFoldedRanges([
    ...foldedRanges.filter((folded) => !rangeContains(range, folded)),
    range,
  ]);
}

function expandFoldedBlock(
  state: EditorState,
  foldedRanges: FoldedRange[],
  lineNumber: number,
) {
  const range = foldedRangeForBlockLine(state, lineNumber);
  if (!range) {
    return foldedRanges;
  }

  return foldedRanges.filter((folded) => folded.from !== range.from || folded.to !== range.to);
}

function collapseFoldedBlocksBelowLevel(state: EditorState, level: number) {
  const lines = documentLines(state);
  return normalizeFoldedRanges(
    collapsibleBlockRangesBelowLevel(lines, level).flatMap((range) => {
      const foldedRange = foldedRangeFromBlockRange(state, range.startLine, range.endLine);
      return foldedRange ? [foldedRange] : [];
    }),
  );
}

function foldedRangeForBlock(state: EditorState, lineNumber: number) {
  const range = foldedRangeForBlockLine(state, lineNumber);
  if (!range) {
    return null;
  }

  return state
    .field(foldedBlockRangesField)
    .find((folded) => folded.from === range.from && folded.to === range.to) ?? null;
}

function foldedRangeForBlockLine(state: EditorState, lineNumber: number) {
  const lines = documentLines(state);
  const range = collapsibleBlockRangeForLines(lines, lineNumber);
  return range ? foldedRangeFromBlockRange(state, range.startLine, range.endLine) : null;
}

function foldedRangeContainingLine(state: EditorState, lineNumber: number) {
  if (lineNumber < 1 || lineNumber > state.doc.lines) {
    return null;
  }

  const position = state.doc.line(lineNumber).from;
  const range = state
    .field(foldedBlockRangesField)
    .find((folded) => position >= folded.from && position <= folded.to);
  if (!range) {
    return null;
  }

  const parentLineNumber = state.doc.lineAt(range.from).number - 1;
  return parentLineNumber >= 1 ? { ...range, parentLineNumber } : null;
}

function collapsibleBlockRangeForStateLine(state: EditorState, lineNumber: number) {
  return collapsibleBlockRangeForLines(documentLines(state), lineNumber);
}

function foldedRangeFromBlockRange(
  state: EditorState,
  startLine: number,
  endLine: number,
) {
  if (startLine >= endLine || startLine < 1 || endLine > state.doc.lines) {
    return null;
  }

  return {
    from: state.doc.line(startLine + 1).from,
    to: state.doc.line(endLine).to,
  };
}

function normalizeFoldedRanges(foldedRanges: FoldedRange[]) {
  const sorted = [...foldedRanges].sort((left, right) => left.from - right.from || right.to - left.to);
  const normalized: FoldedRange[] = [];

  for (const range of sorted) {
    if (normalized.some((existing) => rangeContains(existing, range))) {
      continue;
    }

    normalized.push(range);
  }

  return normalized;
}

function rangeContains(outer: FoldedRange, inner: FoldedRange) {
  return outer.from <= inner.from && outer.to >= inner.to;
}

function documentLines(state: EditorState) {
  const lines: string[] = [];
  for (let lineNumber = 1; lineNumber <= state.doc.lines; lineNumber += 1) {
    lines.push(state.doc.line(lineNumber).text);
  }
  return lines;
}
