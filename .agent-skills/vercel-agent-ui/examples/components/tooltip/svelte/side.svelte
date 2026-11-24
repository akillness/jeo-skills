<script lang="ts">
  import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
  } from "@ui-sdk/svelte/tooltip"

  const sides = [
    { side: "top", label: "Top" },
    { side: "left", label: "Left" },
    { side: "right", label: "Right" },
    { side: "bottom", label: "Bottom" },
  ] as const
</script>

<div data-slot="grid">
  {#each sides as { side, label } (side)}
    <Tooltip>
      <TooltipTrigger>{label}</TooltipTrigger>
      <TooltipContent {side}>Add to library</TooltipContent>
    </Tooltip>
  {/each}
</div>
