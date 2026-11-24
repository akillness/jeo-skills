<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
  import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
  } from "@ui-sdk/svelte/tooltip"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  let open = $state(false)
  let controls: HTMLDivElement | undefined = $state()
</script>

<div data-slot="stack">
  <div data-slot="controls" bind:this={controls}>
    <label data-slot="label">
      <Checkbox bind:checked={() => open, (next) => (open = next === true)}>
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Open
    </label>
  </div>
  <Tooltip
    bind:open
    onOpenChange={(next, details) => {
      const target = details.event?.target
      const inControls = target instanceof Node && controls?.contains(target)
      if (inControls && details.reason !== "escape-key") {
        return details.cancel()
      }
      log(`${next ? "Opened" : "Closed"} (${details.reason})`)
    }}
  >
    <TooltipTrigger>Export</TooltipTrigger>
    <TooltipContent>Download as CSV</TooltipContent>
  </Tooltip>
</div>
