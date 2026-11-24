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
    <ScrollArea render={<section />}>
      {(state) => (
        <>
          <ScrollAreaViewport render={<article />} aria-label="Releases">
            <ScrollAreaContent>
              <ul>
                {tags.map((tag) => (
                  <li key={tag}>{tag}</li>
                ))}
              </ul>
            </ScrollAreaContent>
          </ScrollAreaViewport>
          <p data-slot="hint" aria-hidden>
            {state.atStart
              ? "Scroll for older releases"
              : "More releases below"}
          </p>
          <ScrollAreaScrollbar>
            <ScrollAreaThumb />
          </ScrollAreaScrollbar>
        </>
      )}
    </ScrollArea>
  )
}

export { Example }
