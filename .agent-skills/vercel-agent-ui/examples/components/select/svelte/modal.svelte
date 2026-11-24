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
  } from "@ui-sdk/svelte/select"
  import { useLog } from "../../../shared/svelte/log"

  const statuses = [
    { value: "backlog", label: "Backlog" },
    { value: "todo", label: "Todo" },
    { value: "in-progress", label: "In Progress" },
    { value: "done", label: "Done" },
  ]

  const modes = [
    { value: "pointer", label: "Pointer" },
    { value: true, label: "Modal" },
    { value: false, label: "Non-modal" },
  ] as const

  let modal = $state<boolean | "pointer">("pointer")
  const log = useLog()
</script>

<div data-slot="stack">
  <div data-slot="controls" role="group" aria-label="Modal">
    {#each modes as mode (mode.label)}
      <button
        type="button"
        aria-pressed={modal === mode.value}
        onclick={() => (modal = mode.value)}
      >
        {mode.label}
      </button>
    {/each}
  </div>
  <Field>
    <FieldLabel>Status</FieldLabel>
    <Select {modal} defaultValue="todo">
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        {#each statuses as status (status.value)}
          <SelectItem value={status.value}>
            {status.label}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </Field>
  <button type="button" onclick={() => log("Pressed Save Draft")}
    >Save Draft</button
  >
</div>
