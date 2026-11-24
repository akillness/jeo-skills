"use client"

import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/react/scroll-area"

const delays = [
  { value: 0, label: "No delay" },
  { value: 2000, label: "2000 ms delay" },
]

const tags = Array.from(
  { length: 20 },
  (_, index) => `v1.2.0-beta.${50 - index}`
)

function Example() {
  return (
    <div data-slot="grid">
      {delays.map((delay) => (
        <div data-slot="stack" key={delay.value}>
          <span data-slot="hint">{delay.label}</span>
          <ScrollArea type="scroll" scrollHideDelay={delay.value}>
            <ScrollAreaViewport>
              <ScrollAreaContent>
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
      ))}
    </div>
  )
}

export { Example }
