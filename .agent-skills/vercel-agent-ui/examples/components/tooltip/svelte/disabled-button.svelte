<script lang="ts">
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
  import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
  } from "@ui-sdk/svelte/tooltip"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  let title = $state("")
  const blocked = $derived(!title.trim())
</script>

<div data-slot="stack">
  <Field>
    <FieldLabel>Post title</FieldLabel>
    <Input bind:value={title} />
  </Field>
  <Tooltip disabled={!blocked}>
    <TooltipTrigger
      data-variant="solid"
      aria-disabled={blocked || undefined}
      onclick={() => {
        if (!blocked) {
          log(`Published “${title.trim()}”`)
        }
      }}
    >
      Publish
    </TooltipTrigger>
    <TooltipContent side="right">Add a title to publish</TooltipContent>
  </Tooltip>
</div>
