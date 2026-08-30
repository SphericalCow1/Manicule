export type ParsedCheckboxMarker = {
  from: number;
  to: number;
  marker: string;
  checked: boolean;
  trailingWhitespace: string;
  contentFrom: number;
};

export type ParsedListItemPrefix = {
  indentation: string;
  marker: string;
  markerFrom: number;
  markerTo: number;
  listContentFrom: number;
  checkbox: ParsedCheckboxMarker | null;
};

const listItemPrefixPattern = /^(\s*)([-*+]|\d+[.)])(\s+)/;
const checkboxMarkerPattern = /^\[([ xX])\](\s*)/;

export function parseListItemPrefix(lineText: string): ParsedListItemPrefix | null {
  const listMatch = listItemPrefixPattern.exec(lineText);
  if (!listMatch) {
    return null;
  }

  const markerFrom = listMatch[1].length;
  const markerTo = markerFrom + listMatch[2].length;
  const listContentFrom = listMatch[0].length;
  const checkboxMatch = checkboxMarkerPattern.exec(lineText.slice(listContentFrom));

  return {
    indentation: listMatch[1],
    marker: listMatch[2],
    markerFrom,
    markerTo,
    listContentFrom,
    checkbox: checkboxMatch
      ? {
          from: listContentFrom,
          to: listContentFrom + 3,
          marker: checkboxMatch[0].slice(0, 3),
          checked: checkboxMatch[1].toLowerCase() === "x",
          trailingWhitespace: checkboxMatch[2],
          contentFrom: listContentFrom + checkboxMatch[0].length,
        }
      : null,
  };
}

export function parseCheckboxListItem(lineText: string) {
  const listItem = parseListItemPrefix(lineText);
  return listItem?.checkbox ? { listItem, checkbox: listItem.checkbox } : null;
}

export function listItemTextFrom(prefix: ParsedListItemPrefix) {
  return prefix.checkbox && prefix.checkbox.trailingWhitespace.length > 0
    ? prefix.checkbox.contentFrom
    : prefix.listContentFrom;
}
