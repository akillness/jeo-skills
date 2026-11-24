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
    { value: "owner", label: "Owner" },
  ]

  let value = $state<string | null>("viewer")
  let open = $state(false)
  const log = useLog()
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" onclick={() => (value = "editor")}>Make Editor</button
    >
    <button type="button" onclick={() => (open = true)}>Open</button>
  </div>
  <Field>
    <FieldLabel>Role</FieldLabel>
    <Select
      bind:value
      onValueChange={(next, details) => {
        if (next === "owner") {
          details.cancel()
          log("Only the owner can transfer ownership")
          return
        }
        log(`value: ${next} (${details.reason})`)
      }}
      bind:open
      onOpenChange={(next, details) => log(`open: ${next} (${details.reason})`)}
    >
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
</div>
