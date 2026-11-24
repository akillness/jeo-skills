<script lang="ts">
  import {
    ScrollArea,
    ScrollAreaContent,
    ScrollAreaScrollbar,
    ScrollAreaThumb,
    ScrollAreaViewport,
  } from "@ui-sdk/svelte/scroll-area"

  const delays = [
    { value: 0, label: "No delay" },
    { value: 2000, label: "2000 ms delay" },
  ]

  const tags = Array.from(
    { length: 20 },
    (_, index) => `v1.2.0-beta.${50 - index}`
  )
</script>

<div data-slot="grid">
  {#each delays as delay (delay.value)}
    <div data-slot="stack">
      <span data-slot="hint">{delay.label}</span>
      <ScrollArea type="scroll" scrollHideDelay={delay.value}>
        <ScrollAreaViewport>
          <ScrollAreaContent>
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
  {/each}
</div>
