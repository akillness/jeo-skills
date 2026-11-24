<script lang="ts">
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteInput,
    AutocompleteItem,
    AutocompleteList,
  } from "../../src/autocomplete"

  let {
    data = false,
    presentation,
    defaultOpen,
  }: {
    data?: boolean
    presentation?: "auto" | "popover" | "sheet"
    defaultOpen?: boolean
  } = $props()

  const fruits = ["Lemon", "Mango"]
</script>

{#if data}
  <Autocomplete
    items={fruits}
    name="fruit"
    defaultValue="Mango"
    {presentation}
    {defaultOpen}
  >
    <AutocompleteInput aria-label="Fruit" />
  </Autocomplete>
{:else}
  <Autocomplete name="fruit" defaultValue="Mango" {presentation} {defaultOpen}>
    <AutocompleteInput aria-label="Fruit" />
    <AutocompleteContent>
      <AutocompleteList>
        {#each fruits as fruit (fruit)}
          <AutocompleteItem value={fruit}>{fruit}</AutocompleteItem>
        {/each}
      </AutocompleteList>
    </AutocompleteContent>
  </Autocomplete>
{/if}
