<script lang="ts">
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteInput,
    AutocompleteItem,
    AutocompleteLabel,
    AutocompleteList,
  } from "@ui-sdk/svelte/autocomplete"

  const cities = [
    "القاهرة",
    "القدس",
    "الرباط",
    "الرياض",
    "بيروت",
    "دبي",
    "عمّان",
  ]
</script>

<div dir="rtl">
  <Autocomplete inlineComplete>
    <div data-slot="stack">
      <AutocompleteLabel>المدينة</AutocompleteLabel>
      <AutocompleteInput placeholder="مثلاً: دبي" />
    </div>
    <AutocompleteContent>
      <AutocompleteList>
        {#each cities as city (city)}
          <AutocompleteItem value={city}>
            {city}
          </AutocompleteItem>
        {/each}
      </AutocompleteList>
    </AutocompleteContent>
  </Autocomplete>
</div>
