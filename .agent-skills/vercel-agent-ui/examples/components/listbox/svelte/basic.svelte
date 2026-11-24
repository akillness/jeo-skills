<script lang="ts">
  import { CheckIcon } from "@lucide/svelte"
  import { Field, FieldDescription, FieldLabel } from "@ui-sdk/svelte/field"
  import {
    Listbox,
    ListboxItem,
    ListboxItemIndicator,
  } from "@ui-sdk/svelte/listbox"

  const topics = [
    { value: "comments", label: "Comments" },
    { value: "mentions", label: "Mentions" },
    { value: "reactions", label: "Reactions" },
    { value: "sign-ins", label: "New sign-ins" },
    { value: "billing", label: "Billing" },
  ]
</script>

<Field>
  <FieldLabel>Email me about</FieldLabel>
  <Listbox multiple activation="automatic" defaultValue={["mentions"]}>
    {#each topics as topic (topic.value)}
      <ListboxItem value={topic.value}>
        {topic.label}
        <ListboxItemIndicator>
          <CheckIcon aria-hidden="true" />
        </ListboxItemIndicator>
      </ListboxItem>
    {/each}
  </Listbox>
  <FieldDescription
    >Hold Shift to select a range, or Ctrl or ⌘ to add one.</FieldDescription
  >
</Field>
