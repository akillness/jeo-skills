<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectTrigger,
    SelectValue,
    createSelectController,
  } from "@ui-sdk/svelte/select"
  import { useLog } from "../../../shared/svelte/log"

  const statuses = [
    { value: "backlog", label: "Backlog" },
    { value: "todo", label: "Todo" },
    { value: "in-progress", label: "In Progress" },
    { value: "done", label: "Done" },
  ]

  const status = createSelectController<string>()
  const log = useLog()

  async function openAndWait() {
    const { reason } = await status.open()
    log(`Closed by ${reason}, with ${status.getValue() ?? "nothing"}`)
  }
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={openAndWait}>Open and Wait</button>
    <button type="button" onclick={() => status.setValue("done")}
      >Mark Done</button
    >
    <button type="button" onclick={() => status.clear()}>Clear</button>
    <button type="button" onclick={() => status.focus()}>Focus</button>
  </div>
  <Field>
    <FieldLabel>Status</FieldLabel>
    <SelectTrigger controller={status}>
      <SelectValue />
      <ChevronDownIcon />
    </SelectTrigger>
  </Field>
  <Select controller={status} items={statuses} placeholder="Select a status">
    <SelectContent>
      {#each statuses as item (item.value)}
        <SelectItem value={item.value}>
          {item.label}
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
</div>
