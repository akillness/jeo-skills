import {
  createScrollAreaController,
  ScrollArea,
  ScrollAreaContent,
  ScrollAreaScrollbar,
  ScrollAreaThumb,
  ScrollAreaViewport,
} from "@ui-sdk/solid/scroll-area"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const tags = Array.from(
  { length: 50 },
  (_, index) => `v1.2.0-beta.${50 - index}`
)

function Example() {
  const log = useLog()
  const controller = createScrollAreaController()
  let edge: string | null = "start"

  const read = () => {
    const next = controller.isAtEnd()
      ? "end"
      : controller.isAtStart()
        ? "start"
        : null
    if (next && next !== edge) {
      log(`At the ${next}`)
    }
    edge = next
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
              <For each={tags}>{(tag) => <li>{tag}</li>}</For>
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
