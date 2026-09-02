export type TextChange = {
  from: number;
  to: number;
  insert: string;
};

export function minimalTextChange(current: string, next: string): TextChange | null {
  if (current === next) {
    return null;
  }

  let from = 0;
  const sharedLength = Math.min(current.length, next.length);
  while (from < sharedLength && current.charCodeAt(from) === next.charCodeAt(from)) {
    from += 1;
  }

  let currentTo = current.length;
  let nextTo = next.length;
  while (
    currentTo > from &&
    nextTo > from &&
    current.charCodeAt(currentTo - 1) === next.charCodeAt(nextTo - 1)
  ) {
    currentTo -= 1;
    nextTo -= 1;
  }

  return {
    from,
    to: currentTo,
    insert: next.slice(from, nextTo),
  };
}
