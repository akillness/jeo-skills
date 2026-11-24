"use client"

import {
  createScrollAreaController,
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/react/scroll-area"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

const tags = Array.from(
  { length: 50 },
  (_, index) => `v1.2.0-beta.${50 - index}`
)

function Example() {
  const log = useLog()
  const [controller] = React.useState(createScrollAreaController)
  const edge = React.useRef<string | null>("start")

  const read = () => {
    const next = controller.isAtEnd()
      ? "end"
      : controller.isAtStart()
        ? "start"
        : null
    if (next && next !== edge.current) {
      log(`At the ${next}`)
    }
    edge.current = next
  }

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          type="button"
          onClick={() => controller.scrollToStart({ behavior: "smooth" })}
        >
          Back to Top
        </button>
        <button
          type="button"
          onClick={() => controller.scrollToEnd({ behavior: "instant" })}
        >
          Jump to the End
        </button>
      </div>
      <ScrollArea controller={controller}>
        <ScrollAreaViewport role="region" aria-label="Tags" onScroll={read}>
          <ScrollAreaContent>
            <h3>Tags</h3>
            <ul>
              {tags.map((tag) => (
                <li key={tag}>{tag}</li>
              ))}
            </ul>
          </ScrollAreaContent>
        </ScrollAreaViewport>
        <ScrollAreaScrollbar>
          <ScrollAreaThumb />
        </ScrollAreaScrollbar>
      </ScrollArea>
    </div>
  )
}

export { Example }
