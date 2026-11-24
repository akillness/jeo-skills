<script lang="ts">
  import { ArchiveIcon } from "@lucide/svelte"
  import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
  } from "@ui-sdk/svelte/tooltip"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
</script>

<Tooltip
  onOpenChange={(open) => log(open ? "Opening" : "Closing")}
  onOpenChangeComplete={(open) => log(open ? "Open" : "Closed")}
>
  <TooltipTrigger aria-label="Archive">
    <ArchiveIcon aria-hidden="true" />
  </TooltipTrigger>
  <TooltipContent>Archive</TooltipContent>
</Tooltip>
