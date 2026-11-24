<script lang="ts">
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteEmpty,
    AutocompleteInput,
    AutocompleteItem,
    AutocompleteLabel,
    AutocompleteList,
  } from "@ui-sdk/svelte/autocomplete"

  const fruits = [
    "Apple",
    "Apricot",
    "Avocado",
    "Banana",
    "Blackberry",
    "Blueberry",
  ]

  let box: HTMLDivElement | undefined = $state()
</script>

<div bind:this={box} data-slot="card">
  <Autocomplete modal="pointer" container={box}>
    <div data-slot="stack">
      <AutocompleteLabel>Fruit</AutocompleteLabel>
      <AutocompleteInput />
    </div>
    <AutocompleteContent
      side="top"
      align="end"
      sideOffset={10}
      alignOffset={-4}
      collisionPadding={8}
      anchor={box}
      keepMounted
    >
      <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
      <AutocompleteList>
        {#each fruits as fruit (fruit)}
          <AutocompleteItem value={fruit}>
            {fruit}
          </AutocompleteItem>
        {/each}
      </AutocompleteList>
    </AutocompleteContent>
  </Autocomplete>
</div>
