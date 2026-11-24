<script lang="ts">
  import { FileIcon } from "@lucide/svelte"
  import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
  } from "@ui-sdk/svelte/tooltip"

  const files = [
    "Quarterly report, final revised version for the board.pdf",
    "Notes.txt",
    "Design review recording, October 2nd.mp4",
    "Budget.xlsx",
  ]

  const names: HTMLSpanElement[] = []
</script>

<ul>
  {#each files as file, index (file)}
    <li>
      <Tooltip
        type="label"
        onOpenChange={(open, details) => {
          const span = names[index]
          if (open && span && span.scrollWidth <= span.clientWidth) {
            details.cancel()
          }
        }}
      >
        <TooltipTrigger>
          <FileIcon aria-hidden="true" />
          <span bind:this={names[index]}>{file}</span>
        </TooltipTrigger>
        <TooltipContent>{file}</TooltipContent>
      </Tooltip>
    </li>
  {/each}
</ul>
