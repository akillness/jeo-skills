import {
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/solid/scroll-area"
import { For } from "solid-js"

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
      <For each={delays}>
        {(delay) => (
          <div data-slot="stack">
            <span data-slot="hint">{delay.label}</span>
            <ScrollArea type="scroll" scrollHideDelay={delay.value}>
              <ScrollAreaViewport>
                <ScrollAreaContent>
                  <ul>
                    <For each={tags}>{(tag) => <li>{tag}</li>}</For>
                  </ul>
                </ScrollAreaContent>
              </ScrollAreaViewport>
              <ScrollAreaScrollbar>
                <ScrollAreaThumb />
              </ScrollAreaScrollbar>
            </ScrollArea>
          </div>
        )}
      </For>
    </div>
  )
}

export { Example }
