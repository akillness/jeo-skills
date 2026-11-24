<script lang="ts">
  import { CheckIcon, ChevronDownIcon, XIcon } from "@lucide/svelte"
  import { Field, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Select,
    SelectClear,
    SelectContent,
    SelectItem,
    SelectItemIndicator,
    SelectTrigger,
    SelectValue,
  } from "@ui-sdk/svelte/select"
  import { useLog } from "../../../shared/svelte/log"

  const people = [
    { value: "hollis", label: "Hollis Grant" },
    { value: "ines", label: "Inès Moreau" },
    { value: "kofi", label: "Kofi Mensah" },
    { value: "wren", label: "Wren Takahashi" },
    { value: "tomasz", label: "Tomasz Wójcik" },
  ]

  const log = useLog()
</script>

<Field>
  <FieldLabel>Assignee</FieldLabel>
  <Select
    defaultValue="ines"
    placeholder="Unassigned"
    onValueChange={(value, details) =>
      log(`value: ${JSON.stringify(value)} (${details.reason})`)}
  >
    <div data-slot="row">
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectClear aria-label="Clear assignee">
        <XIcon />
      </SelectClear>
    </div>
    <SelectContent>
      {#each people as person (person.value)}
        <SelectItem value={person.value}>
          {person.label}
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
</Field>
