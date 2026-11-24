import type { MatchSegment } from "@ui-sdk/core/combobox"

// An item's text with the parts that matched in `<mark>`, for the list
// components' item text parts.
function markSegments(segments: MatchSegment[]) {
  return segments.map(({ text, match }, index) =>
    match ? <mark key={index}>{text}</mark> : text
  )
}

// The text an item text part marks: its own string content, or else its item's label.
function textToMark(children: unknown, label: string | undefined) {
  return typeof children === "string" ? children : (label ?? "")
}

export { markSegments, textToMark }
