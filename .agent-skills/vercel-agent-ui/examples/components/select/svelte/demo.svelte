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

  const roles = [
    { value: "viewer", label: "Viewer" },
    { value: "commenter", label: "Commenter" },
    { value: "editor", label: "Editor" },
    { value: "admin", label: "Admin" },
  ]
</script>

<Field>
  <FieldLabel>Role</FieldLabel>
  <Select placeholder="Select a role">
    <SelectTrigger>
      <SelectValue />
      <ChevronDownIcon />
    </SelectTrigger>
    <SelectContent>
      {#each roles as role (role.value)}
        <SelectItem value={role.value}>
          {role.label}
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
</Field>
