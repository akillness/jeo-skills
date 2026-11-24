<script lang="ts">
  import { InfoIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
  import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
  } from "@ui-sdk/svelte/tooltip"

  let field: HTMLDivElement | undefined = $state()
</script>

<Field>
  <FieldLabel>Webhook URL</FieldLabel>
  <div data-slot="row" bind:this={field}>
    <Input placeholder="https://" />
    <Tooltip>
      <TooltipTrigger aria-label="About webhooks">
        <InfoIcon aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent anchor={field} side="bottom" align="start">
        We send a POST request here for every new order.
      </TooltipContent>
    </Tooltip>
  </div>
</Field>
