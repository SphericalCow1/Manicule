export type InlineMarkdownFormat = "bold" | "italic" | "strikethrough" | "inline-code";

const formatMarkers: Record<InlineMarkdownFormat, string> = {
  bold: "**",
  italic: "*",
  strikethrough: "~~",
  "inline-code": "`",
};

export function canApplyInlineMarkdownFormat(value: string, format: InlineMarkdownFormat) {
  return format !== "inline-code" || !/\r?\n/.test(value);
}

export function applyInlineMarkdownFormat(value: string, format: InlineMarkdownFormat) {
  if (!canApplyInlineMarkdownFormat(value, format)) {
    return null;
  }

  const marker = formatMarkers[format];
  const segments = value.split(/(\r?\n)/);
  const textSegments = segments.filter((_, index) => index % 2 === 0);
  const nonEmptyTextSegments = textSegments.filter((segment) => segment.length > 0);
  const removeMarker =
    nonEmptyTextSegments.length > 0 &&
    nonEmptyTextSegments.every(
      (segment) =>
        segment.length >= marker.length * 2 &&
        segment.startsWith(marker) &&
        segment.endsWith(marker),
    );

  return segments
    .map((segment, index) => {
      if (index % 2 === 1 || segment.length === 0) {
        return segment;
      }

      return removeMarker
        ? segment.slice(marker.length, -marker.length)
        : `${marker}${segment}${marker}`;
    })
    .join("");
}
