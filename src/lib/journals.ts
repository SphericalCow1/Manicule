export type JournalDay = "yesterday" | "today" | "tomorrow";

export function journalPath(date = new Date(), root = "journal") {
  return `${root}/${formatDate(date)}.md`;
}

export function journalPathForDay(day: JournalDay, date = new Date(), root = "journal") {
  const target = new Date(date);

  if (day === "yesterday") {
    target.setDate(target.getDate() - 1);
  } else if (day === "tomorrow") {
    target.setDate(target.getDate() + 1);
  }

  return journalPath(target, root);
}

export function journalPathForDateInput(dateInput: string, root = "journal") {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateInput);
  if (!match) {
    return null;
  }

  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (
    date.getFullYear() !== Number(year) ||
    date.getMonth() !== Number(month) - 1 ||
    date.getDate() !== Number(day)
  ) {
    return null;
  }

  return journalPath(date, root);
}

function formatDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}
