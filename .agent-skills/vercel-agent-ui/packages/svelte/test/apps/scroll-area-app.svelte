<script lang="ts">
  import {
    ScrollArea,
    ScrollAreaContent,
    ScrollAreaScrollbar,
    ScrollAreaScrollToEnd,
    ScrollAreaThumb,
    ScrollAreaViewport,
  } from "../../src/scroll-area"
</script>

<ScrollArea stickToEnd>
  <ScrollAreaViewport aria-label="Messages"
    ><ScrollAreaContent>Hello</ScrollAreaContent></ScrollAreaViewport
  >
  <ScrollAreaScrollbar><ScrollAreaThumb /></ScrollAreaScrollbar>
  <ScrollAreaScrollToEnd>Jump to latest</ScrollAreaScrollToEnd>
</ScrollArea>
