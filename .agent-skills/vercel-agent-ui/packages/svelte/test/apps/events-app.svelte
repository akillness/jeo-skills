<script lang="ts">
  import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
  } from "../../src/collapsible"
  import { Popover, PopoverContent, PopoverTrigger } from "../../src/popover"

  let {
    log,
    prevent = false,
  }: { log: (entry: string) => void; prevent?: boolean } = $props()
</script>

<Collapsible onOpenChange={(open) => log(`core:${open}`)}>
  <CollapsibleTrigger
    onclick={(event) => {
      log("user:click")
      if (prevent) {
        event.preventDefault()
      }
    }}
    onkeydown={() => log("user:keydown")}
    onpointerdown={() => log("user:pointerdown")}
  >
    Details
  </CollapsibleTrigger>
  <CollapsiblePanel>Panel</CollapsiblePanel>
</Collapsible>

<Popover onOpenChange={(open) => log(`outer:${open}`)}>
  <PopoverTrigger>Open</PopoverTrigger>
  <PopoverContent aria-label="Outer">
    <Popover onOpenChange={(open) => log(`inner:${open}`)}>
      <PopoverTrigger>More</PopoverTrigger>
      <PopoverContent aria-label="Inner"
        ><button>Archive</button></PopoverContent
      >
    </Popover>
  </PopoverContent>
</Popover>
