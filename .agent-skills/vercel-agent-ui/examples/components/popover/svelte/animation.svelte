<script lang="ts">
  import {
    Popover,
    PopoverClose,
    PopoverContent,
    PopoverDescription,
    PopoverTitle,
    PopoverTrigger,
  } from "@ui-sdk/svelte/popover"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Popover
  onOpenChange={(open) => log(open ? "Opening" : "Closing")}
  onOpenChangeComplete={(open) => log(open ? "Open" : "Closed")}
>
  <PopoverTrigger>What's New</PopoverTrigger>
  <PopoverContent keepMounted>
    <PopoverTitle>What's new</PopoverTitle>
    <PopoverDescription
      >Comments now support threads and reactions.</PopoverDescription
    >
    <div data-slot="row">
      <PopoverClose data-variant="solid">Got It</PopoverClose>
    </div>
  </PopoverContent>
</Popover>
