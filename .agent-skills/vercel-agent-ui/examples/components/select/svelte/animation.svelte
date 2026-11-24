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

  const roles = [
    { value: "viewer", label: "Viewer" },
    { value: "commenter", label: "Commenter" },
    { value: "editor", label: "Editor" },
    { value: "admin", label: "Admin" },
  ]

  const log = useLog()
</script>

<Field>
  <FieldLabel>Role</FieldLabel>
  <Select
    defaultValue="editor"
    onOpenChangeComplete={(open) =>
      log(open ? "Finished opening" : "Finished closing")}
  >
    <SelectTrigger>
      <SelectValue />
      <ChevronDownIcon />
    </SelectTrigger>
    <SelectContent>
      {#each roles as role (role.value)}
        <SelectItem value={role.value}>
          {role.label}
          <SelectItemIndicator keepMounted>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      {/each}
    </SelectContent>
  </Select>
</Field>
