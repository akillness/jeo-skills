"use client"

import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
  type ScrollAreaType,
} from "@ui-sdk/react/scroll-area"

const types: ScrollAreaType[] = ["hover", "scroll", "auto", "always"]

const tags = Array.from(
  { length: 20 },
  (_, index) => `v1.2.0-beta.${50 - index}`
)

function Example() {
  return (
    <div data-slot="grid">
      {types.map((type) => (
        <div data-slot="stack" key={type}>
          <code>type="{type}"</code>
          <ScrollArea type={type}>
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
