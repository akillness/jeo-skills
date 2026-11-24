<script lang="ts">
  import {
    Tooltip,
    TooltipArrow,
    TooltipContent,
    TooltipTrigger,
  } from "@ui-sdk/svelte/tooltip"

  const sides = [
    { side: "right", label: "يمين" },
    { side: "top", label: "أعلى" },
    { side: "bottom", label: "أسفل" },
    { side: "left", label: "يسار" },
  ] as const
</script>

<div dir="rtl" data-slot="row">
  {#each sides as { side, label } (side)}
    <Tooltip>
      <TooltipTrigger>{label}</TooltipTrigger>
      <TooltipContent {side} align="start" sideOffset={8}>
        <TooltipArrow />
        أضف إلى المكتبة
      </TooltipContent>
    </Tooltip>
  {/each}
</div>
