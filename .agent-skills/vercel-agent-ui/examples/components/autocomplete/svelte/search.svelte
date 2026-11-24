<script lang="ts">
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteEmpty,
    AutocompleteInput,
    AutocompleteItem,
    AutocompleteList,
  } from "@ui-sdk/svelte/autocomplete"
  import { useLog } from "../../../shared/svelte/log"

  const recent = [
    "react hooks",
    "tailwind grid",
    "web components",
    "vue v-model",
  ]

  const log = useLog()
</script>

<form
  role="search"
  data-slot="stack"
  onsubmit={(event) => event.preventDefault()}
>
  <Autocomplete
    submitOnSelect
    name="q"
    onSubmit={(value) => log(`Searched “${value}”`)}
  >
    <AutocompleteInput
      type="search"
      aria-label="Search"
      placeholder="Search…"
    />
    <AutocompleteContent>
      <AutocompleteEmpty>No results.</AutocompleteEmpty>
      <AutocompleteList>
        {#each recent as search (search)}
          <AutocompleteItem value={search}>
            {search}
          </AutocompleteItem>
        {/each}
      </AutocompleteList>
    </AutocompleteContent>
  </Autocomplete>
</form>
