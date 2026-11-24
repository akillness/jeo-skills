import type { MatchSegment } from "@ui-sdk/core/combobox"
import { For } from "solid-js"

// An item's text with the parts that matched in `<mark>`, for the list
// components' item text parts.
function markSegments(segments: MatchSegment[]) {
  return (
    <For each={segments}>
      {(segment) =>
        segment.match ? <mark>{segment.text}</mark> : segment.text
      }
    </For>
  )
}

// The text an item text part marks: its own string content, or else its item's label.
function textToMark(children: unknown, label: string | undefined) {
  return typeof children === "string" ? children : (label ?? "")
}

export { markSegments, textToMark }
