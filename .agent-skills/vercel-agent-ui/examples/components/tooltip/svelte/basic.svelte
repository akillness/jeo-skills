<script lang="ts">
  import { BookmarkIcon } from "@lucide/svelte"
  import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
  } from "@ui-sdk/svelte/tooltip"
</script>

<Tooltip defaultOpen>
  <TooltipTrigger aria-label="Add to library">
    <BookmarkIcon aria-hidden="true" />
  </TooltipTrigger>
  <TooltipContent>Add to library</TooltipContent>
</Tooltip>
