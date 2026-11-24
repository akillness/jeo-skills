<script lang="ts">
  import { CheckIcon, LoaderCircleIcon, PlusIcon, XIcon } from "@lucide/svelte"
  import {
    Combobox,
    ComboboxChip,
    ComboboxChipRemove,
    ComboboxChips,
    ComboboxContent,
    ComboboxCreate,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemIndicator,
    ComboboxLabel,
    ComboboxList,
    ComboboxValue,
  } from "@ui-sdk/svelte/combobox"

  const initialLabels = [
    "Bug",
    "Feature",
    "Documentation",
    "Design",
    "Performance",
    "Security",
    "Testing",
  ]

  function saveLabel(name: string) {
    return new Promise<void>((resolve, reject) =>
      setTimeout(
        () =>
          name.length > 20
            ? reject(new Error("Labels are 20 characters at most."))
            : resolve(),
        800
      )
    )
  }

  let labels = $state(initialLabels)
  let value = $state<string[]>(["Bug"])

  async function create(query: string) {
    await saveLabel(query)
    labels = [...labels, query]
    value = [...value, query]
  }
</script>

<Combobox bind:value multiple>
  <div data-slot="stack">
    <ComboboxLabel>Labels</ComboboxLabel>
    <ComboboxChips>
      <ComboboxValue>
        {#snippet children({ value: selected })}
          {#each selected as string[] as label (label)}
            <ComboboxChip value={label}>
              {label}
              <ComboboxChipRemove aria-label={`Remove ${label}`}>
                <XIcon aria-hidden="true" />
              </ComboboxChipRemove>
            </ComboboxChip>
          {/each}
        {/snippet}
      </ComboboxValue>
      <ComboboxInput placeholder="Add or create a label…" />
    </ComboboxChips>
  </div>
  <ComboboxContent>
    <ComboboxList>
      {#each labels as label (label)}
        <ComboboxItem value={label}>
          {label}
          <ComboboxItemIndicator>
            <CheckIcon aria-hidden="true" />
          </ComboboxItemIndicator>
        </ComboboxItem>
      {/each}
      <ComboboxCreate minLength={2} onCreate={create}>
        {#snippet children(state)}
          {#if state.pending}
            <LoaderCircleIcon aria-hidden="true" data-slot="spinner" />
            Creating “{state.query}”…
          {:else}
            <PlusIcon aria-hidden="true" />
            <span data-slot="stack">
              Create “{state.query}”
              {#if state.error}<span data-slot="hint"
                  >{(state.error as Error).message}</span
                >{/if}
            </span>
          {/if}
        {/snippet}
      </ComboboxCreate>
    </ComboboxList>
  </ComboboxContent>
</Combobox>
