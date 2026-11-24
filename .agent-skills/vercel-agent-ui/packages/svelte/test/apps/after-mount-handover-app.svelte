<script lang="ts">
  import { Drawer, DrawerContent, DrawerTitle } from "../../src/drawer"
  import {
    ScrollArea,
    ScrollAreaContent,
    ScrollAreaViewport,
  } from "../../src/scroll-area"

  let { side, stickToEnd }: { side: "bottom" | "right"; stickToEnd: boolean } =
    $props()
</script>

<Drawer defaultOpen {side}>
  <DrawerContent><DrawerTitle>Move goal</DrawerTitle></DrawerContent>
</Drawer>
<ScrollArea {stickToEnd}>
  <ScrollAreaViewport aria-label="Messages"
    ><ScrollAreaContent>Hello</ScrollAreaContent></ScrollAreaViewport
  >
</ScrollArea>
