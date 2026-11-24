<script lang="ts">
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteEmpty,
    AutocompleteInput,
    AutocompleteItem,
    AutocompleteItemText,
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
    "Cherry",
    "Grape",
    "Lemon",
    "Mango",
    "Orange",
    "Peach",
    "Pear",
    "Pineapple",
    "Strawberry",
  ]
</script>

<Autocomplete>
  <div data-slot="stack">
    <AutocompleteLabel>Favorite fruit</AutocompleteLabel>
    <AutocompleteInput placeholder="e.g. berry" />
  </div>
  <AutocompleteContent>
    <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
    <AutocompleteList>
      {#each fruits as fruit (fruit)}
        <AutocompleteItem value={fruit}>
          <AutocompleteItemText>
            {#snippet render({ props, state })}
              <span {...props}>
                {#each state.segments as segment, index (index)}
                  {#if segment.match}
                    <strong>{segment.text}</strong>
                  {:else}
                    {segment.text}
                  {/if}
                {/each}
              </span>
            {/snippet}
          </AutocompleteItemText>
        </AutocompleteItem>
      {/each}
    </AutocompleteList>
  </AutocompleteContent>
</Autocomplete>
