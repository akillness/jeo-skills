<script lang="ts">
  import {
    ScrollArea,
    ScrollAreaContent,
    ScrollAreaScrollbar,
    ScrollAreaThumb,
    ScrollAreaViewport,
  } from "@ui-sdk/svelte/scroll-area"

  const tags = Array.from({ length: 40 }, (_, index) => `وسم ${index + 1}`)
</script>

<div dir="rtl">
  <ScrollArea>
    <ScrollAreaViewport>
      <ScrollAreaContent>
        <h4>الوسوم</h4>
        {#each tags as tag (tag)}
          <div>
            {tag}
          </div>
        {/each}
      </ScrollAreaContent>
    </ScrollAreaViewport>
    <ScrollAreaScrollbar>
      <ScrollAreaThumb />
    </ScrollAreaScrollbar>
  </ScrollArea>
</div>
