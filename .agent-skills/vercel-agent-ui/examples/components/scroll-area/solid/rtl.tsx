import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/solid/scroll-area"
import { For } from "solid-js"

const tags = Array.from({ length: 40 }, (_, index) => `وسم ${index + 1}`)

function Example() {
  return (
    <div dir="rtl">
      <ScrollArea>
        <ScrollAreaViewport>
          <ScrollAreaContent>
            <h4>الوسوم</h4>
            <For each={tags}>{(tag) => <div>{tag}</div>}</For>
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
