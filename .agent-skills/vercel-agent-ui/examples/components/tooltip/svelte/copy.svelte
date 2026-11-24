<script lang="ts">
  import { CheckIcon, CopyIcon } from "@lucide/svelte"
  import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
  } from "@ui-sdk/svelte/tooltip"

  const command = "npm install @ui-sdk/svelte"
  let copied = $state(false)
</script>

<div data-slot="row">
  <code>{command}</code>
  <Tooltip
    closeOnPress={false}
    onOpenChangeComplete={(open) => {
      if (!open) {
        copied = false
      }
    }}
  >
    <TooltipTrigger
      aria-label={copied ? "Copied" : "Copy"}
      onclick={() => {
        navigator.clipboard?.writeText(command).catch(() => {})
        copied = true
      }}
    >
      {#if copied}
        <CheckIcon aria-hidden="true" />
      {:else}
        <CopyIcon aria-hidden="true" />
      {/if}
    </TooltipTrigger>
    <TooltipContent>{copied ? "Copied" : "Copy"}</TooltipContent>
  </Tooltip>
</div>
