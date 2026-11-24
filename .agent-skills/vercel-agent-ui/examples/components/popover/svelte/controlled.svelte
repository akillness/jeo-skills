<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import { Input } from "@ui-sdk/svelte/input"
  import {
    Popover,
    PopoverClose,
    PopoverContent,
    PopoverDescription,
    PopoverTitle,
    PopoverTrigger,
  } from "@ui-sdk/svelte/popover"
  import { useLog } from "../../../shared/svelte/log"

  const log = useLog()
  let open = $state(false)
  let controls: HTMLDivElement | undefined = $state()
</script>

<div data-slot="stack">
  <div data-slot="controls" bind:this={controls}>
    <label data-slot="label">
      <Checkbox
        checked={open}
        onCheckedChange={(next) => (open = next === true)}
      >
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Open
    </label>
  </div>
  <Popover
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
    <PopoverTrigger>Set Status</PopoverTrigger>
    <PopoverContent>
      <PopoverTitle>Set a status</PopoverTitle>
      <PopoverDescription
        >Your team sees it next to your name.</PopoverDescription
      >
      <Field>
        <FieldLabel>Status</FieldLabel>
        <Input defaultValue="In a meeting" />
      </Field>
      <div data-slot="row">
        <PopoverClose>Cancel</PopoverClose>
        <PopoverClose data-variant="solid">Save</PopoverClose>
      </div>
    </PopoverContent>
  </Popover>
</div>
