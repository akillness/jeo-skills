"use client"

import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/react/scroll-area"

const tags = Array.from({ length: 40 }, (_, index) => `وسم ${index + 1}`)

function Example() {
  return (
    <div dir="rtl">
      <ScrollArea>
        <ScrollAreaViewport>
          <ScrollAreaContent>
            <h4>الوسوم</h4>
            {tags.map((tag) => (
              <div key={tag}>{tag}</div>
            ))}
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
