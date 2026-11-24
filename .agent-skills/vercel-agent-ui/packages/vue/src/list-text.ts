import type { MatchSegment } from "@ui-sdk/core/combobox"
import { h, Text, type VNode } from "vue"

// An item's text with the parts that matched in `<mark>`, for the list
// components' item text parts.
function markSegments(segments: MatchSegment[]) {
  return segments.map(({ text, match }) => (match ? h("mark", text) : text))
}

// The text of a default slot that holds only text, like `<ComboboxItemText>France</ComboboxItemText>`,
// or undefined when it holds elements, which render as they are.
function slotText(nodes: VNode[] | undefined) {
  if (!nodes?.length || !nodes.every((node) => node.type === Text)) {
    return undefined
  }
  return nodes.map((node) => node.children as string).join("")
}

export { markSegments, slotText }
