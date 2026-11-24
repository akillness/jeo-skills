<script lang="ts">
  import {
    createScrollAreaController,
    ScrollArea,
    ScrollAreaContent,
    ScrollAreaScrollbar,
    ScrollAreaThumb,
    ScrollAreaViewport,
  } from "@ui-sdk/svelte/scroll-area"
  import { useLog } from "../../../shared/svelte/log"

  const tags = Array.from(
    { length: 50 },
    (_, index) => `v1.2.0-beta.${50 - index}`
  )

  const log = useLog()
  const controller = createScrollAreaController()
  let edge: string | null = "start"

  function read() {
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
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button
      type="button"
      onclick={() => controller.scrollToStart({ behavior: "smooth" })}
    >
      Back to Top
    </button>
    <button
      type="button"
      onclick={() => controller.scrollToEnd({ behavior: "instant" })}
    >
      Jump to the End
    </button>
  </div>
  <ScrollArea {controller}>
    <ScrollAreaViewport role="region" aria-label="Tags" onscroll={read}>
      <ScrollAreaContent>
        <h3>Tags</h3>
        <ul>
          {#each tags as tag (tag)}
            <li>{tag}</li>
          {/each}
        </ul>
      </ScrollAreaContent>
    </ScrollAreaViewport>
    <ScrollAreaScrollbar>
      <ScrollAreaThumb />
    </ScrollAreaScrollbar>
  </ScrollArea>
</div>
