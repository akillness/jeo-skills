<script lang="ts">
  import {
    Combobox,
    ComboboxChip,
    ComboboxChipRemove,
    ComboboxChips,
    ComboboxContent,
    ComboboxInput,
    ComboboxItem,
    ComboboxList,
    ComboboxValue,
  } from "../../src/combobox"

  let {
    data = false,
    multiple = false,
    itemToLabel,
    presentation,
    defaultOpen,
  }: {
    data?: boolean
    multiple?: boolean
    itemToLabel?: (value: string) => string
    presentation?: "auto" | "popover" | "sheet"
    defaultOpen?: boolean
  } = $props()

  const countries = [
    { value: "br", label: "Brazil" },
    { value: "fr", label: "France" },
  ]
  const defaultValue = $derived(multiple ? ["br", "fr"] : "fr")
</script>

{#if data}
  <Combobox
    items={countries}
    name="country"
    {defaultValue}
    {multiple}
    {presentation}
    {defaultOpen}
  >
    {#if multiple}
      <ComboboxChips>
        <ComboboxValue>
          {#snippet children(state)}
            {#each state.value as string[] as item (item)}
              <ComboboxChip value={item}
                ><ComboboxChipRemove aria-label="Remove">×</ComboboxChipRemove
                ></ComboboxChip
              >
            {/each}
          {/snippet}
        </ComboboxValue>
        <ComboboxInput aria-label="Country" />
      </ComboboxChips>
    {:else}
      <ComboboxInput aria-label="Country" />
    {/if}
  </Combobox>
{:else}
  <Combobox
    name="country"
    {defaultValue}
    {multiple}
    {itemToLabel}
    {presentation}
    {defaultOpen}
  >
    <ComboboxInput aria-label="Country" />
    <ComboboxContent>
      <ComboboxList>
        {#each countries as country (country.value)}
          <ComboboxItem value={country.value} label={country.label}
            >{country.label}</ComboboxItem
          >
        {/each}
      </ComboboxList>
    </ComboboxContent>
  </Combobox>
{/if}
