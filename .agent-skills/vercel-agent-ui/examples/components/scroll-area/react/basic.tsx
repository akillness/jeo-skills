"use client"

import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/react/scroll-area"

const tags = Array.from(
  { length: 50 },
  (_, index) => `v1.2.0-beta.${50 - index}`
)

function Example() {
  return (
    <ScrollArea>
      <ScrollAreaViewport role="region" aria-label="Tags">
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
  )
}

export { Example }
