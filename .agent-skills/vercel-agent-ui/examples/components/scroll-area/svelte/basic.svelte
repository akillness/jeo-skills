<script lang="ts">
  import {
    ScrollArea,
    ScrollAreaContent,
    ScrollAreaScrollbar,
    ScrollAreaThumb,
    ScrollAreaViewport,
  } from "@ui-sdk/svelte/scroll-area"

  const tags = Array.from(
    { length: 50 },
    (_, index) => `v1.2.0-beta.${50 - index}`
  )
</script>

<ScrollArea>
  <ScrollAreaViewport role="region" aria-label="Tags">
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
