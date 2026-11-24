<script lang="ts">
  import { CheckIcon, XIcon } from "@lucide/svelte"
  import {
    Combobox,
    ComboboxChip,
    ComboboxChipRemove,
    ComboboxChips,
    ComboboxContent,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemIndicator,
    ComboboxLabel,
    ComboboxList,
    ComboboxValue,
  } from "@ui-sdk/svelte/combobox"

  const labels = [
    "Bug",
    "Feature",
    "Documentation",
    "Design",
    "Performance",
    "Security",
    "Testing",
  ]
</script>

<Combobox multiple maxSelected={3} defaultValue={["Bug", "Design"]}>
  <div data-slot="stack">
    <ComboboxLabel>Labels (up to 3)</ComboboxLabel>
    <ComboboxChips>
      <ComboboxValue>
        {#snippet children(state)}
          {#each state.value as string[] as label (label)}
            <ComboboxChip value={label}>
              {label}
              <ComboboxChipRemove aria-label={`Remove ${label}`}>
                <XIcon aria-hidden="true" />
              </ComboboxChipRemove>
            </ComboboxChip>
          {/each}
        {/snippet}
      </ComboboxValue>
      <ComboboxInput placeholder="Add labels…" />
    </ComboboxChips>
  </div>
  <ComboboxContent>
    <ComboboxList>
      {#each labels as label (label)}
        <ComboboxItem value={label}>
          {#snippet children(state)}
            {label}
            {#if state.maxReached}
              <span data-slot="hint">Limit reached</span>
            {/if}
            <ComboboxItemIndicator>
              <CheckIcon aria-hidden="true" />
            </ComboboxItemIndicator>
          {/snippet}
        </ComboboxItem>
      {/each}
    </ComboboxList>
  </ComboboxContent>
</Combobox>
