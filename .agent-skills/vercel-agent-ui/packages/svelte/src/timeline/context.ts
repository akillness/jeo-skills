import type { TimelineStatus } from "@ui-sdk/core/timeline"
import { getContext } from "svelte"

// The value and status of the event a marker, connector, time, title or
// description belongs to.
const ItemKey = Symbol("timeline-item")

type ItemContext = {
  value: () => string
  status: () => TimelineStatus | undefined
}

function useItem() {
  const item = getContext<ItemContext | undefined>(ItemKey)
  if (!item) {
    throw new Error(
      "Timeline markers, connectors, times, titles and descriptions must be used inside <TimelineItem>."
    )
  }
  return item
}

export { type ItemContext, ItemKey, useItem }
