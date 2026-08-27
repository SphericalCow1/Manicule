import { checkboxLines } from "./checkboxes.js";

export function renderCheckboxItems(html: string, markdown = "", sourceLineNumbers: number[] = []) {
  const lines = checkboxLines(markdown);
  let checkboxIndex = 0;

  return html.replaceAll(/<li>\[([ xX])\]\s*/g, (_match, marker: string) => {
    const checked = marker.toLowerCase() === "x";
    const localLine = lines[checkboxIndex++]?.lineNumber;
    const line = localLine ? (sourceLineNumbers[localLine - 1] ?? localLine) : "";
    const checkedAttribute = checked ? " checked" : "";
    const label = checked ? "Checked task" : "Unchecked task";

    return `<li class="task-list-item"><input class="task-list-checkbox" type="checkbox"${checkedAttribute} data-line="${line}" aria-label="${label}" /> `;
  });
}
