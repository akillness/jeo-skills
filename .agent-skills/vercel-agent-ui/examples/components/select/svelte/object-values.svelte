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

  type Member = { id: number; name: string; email: string }

  const members: Member[] = [
    { id: 1, name: "Hollis Grant", email: "hollis@example.com" },
    { id: 2, name: "Inès Moreau", email: "ines@example.com" },
    { id: 3, name: "Kofi Mensah", email: "kofi@example.com" },
    { id: 4, name: "Wren Takahashi", email: "wren@example.com" },
  ]

  const log = useLog()
</script>

<Field>
  <FieldLabel>Assignee</FieldLabel>
  <Select
    defaultValue={{ ...members[1] }}
    onValueChange={(member) =>
      log(`Submits assignee=${member ? member.id : ""}`)}
    name="assignee"
    itemToValue={(member) => String(member.id)}
    itemToLabel={(member) => member.name}
    isItemEqualToValue={(item, value) => item.id === value.id}
    placeholder="Unassigned"
  >
    <SelectTrigger>
      <SelectValue />
      <ChevronDownIcon />
    </SelectTrigger>
    <SelectContent>
      {#each members as member (member.id)}
        <SelectItem value={member}>
          <span data-slot="stack">
            {member.name}
            <span data-slot="hint">{member.email}</span>
          </span>
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
</Field>
