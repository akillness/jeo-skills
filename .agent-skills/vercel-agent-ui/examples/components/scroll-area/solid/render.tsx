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
    <ScrollArea render={(props) => <section {...props} />}>
      {(state) => (
        <>
          <ScrollAreaViewport
            render={(props) => <article {...props} />}
            aria-label="Releases"
          >
            <ScrollAreaContent>
              <ul>
                <For each={tags}>{(tag) => <li>{tag}</li>}</For>
              </ul>
            </ScrollAreaContent>
          </ScrollAreaViewport>
          <p data-slot="hint" aria-hidden="true">
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
