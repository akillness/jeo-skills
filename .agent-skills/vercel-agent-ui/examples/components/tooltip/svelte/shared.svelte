<script lang="ts">
  import { BoldIcon, ItalicIcon, UnderlineIcon } from "@lucide/svelte"
  import {
    createTooltipController,
    Tooltip,
    TooltipContent,
    type TooltipContentState,
    TooltipTrigger,
  } from "@ui-sdk/svelte/tooltip"

  const formats = [
    { icon: BoldIcon, label: "Bold" },
    { icon: ItalicIcon, label: "Italic" },
    { icon: UnderlineIcon, label: "Underline" },
  ]

  const tooltip = createTooltipController<string>()
</script>

<div data-slot="row" role="group" aria-label="Formatting">
  {#each formats as format (format.label)}
    <TooltipTrigger
      controller={tooltip}
      payload={format.label}
      aria-label={format.label}
    >
      <format.icon aria-hidden="true" />
    </TooltipTrigger>
  {/each}
  <Tooltip controller={tooltip}>
    <TooltipContent>
      {#snippet children(
        state: TooltipContentState<string>
      )}{state.payload}{/snippet}
    </TooltipContent>
  </Tooltip>
</div>
