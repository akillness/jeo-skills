import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/solid/scroll-area"
import { For } from "solid-js"

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
            <For each={tags}>{(tag) => <li>{tag}</li>}</For>
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
