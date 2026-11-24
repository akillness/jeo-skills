<script lang="ts">
  import { CheckIcon, ChevronDownIcon } from "@lucide/svelte"
  import { Checkbox, CheckboxIndicator } from "@ui-sdk/svelte/checkbox"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"

  const priorities = [
    { value: "urgent", label: "Urgent" },
    { value: "high", label: "High" },
    { value: "medium", label: "Medium" },
    { value: "low", label: "Low" },
    { value: "none", label: "No priority" },
  ]

  let aligned = $state(true)
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <label data-slot="label">
      <Checkbox
        checked={aligned}
        onCheckedChange={(next) => (aligned = next === true)}
      >
        <CheckboxIndicator>
          <CheckIcon />
        </CheckboxIndicator>
      </Checkbox>
      Align item with trigger
    </label>
  </div>
  <Field>
    <FieldLabel>Priority</FieldLabel>
    <Select defaultValue="medium">
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={aligned}>
        {#each priorities as priority (priority.value)}
          <SelectItem value={priority.value}>
            {priority.label}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        {/each}
      </SelectContent>
    </Select>
  </Field>
</div>
