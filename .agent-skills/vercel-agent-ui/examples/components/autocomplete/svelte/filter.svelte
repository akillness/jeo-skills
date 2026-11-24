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

  const tags = [
    {
      value: "feature",
      label: "feature",
      keywords: ["enhancement", "request"],
    },
    { value: "fix", label: "fix", keywords: ["bug", "patch"] },
    { value: "docs", label: "docs", keywords: ["documentation", "readme"] },
    { value: "performance", label: "performance", keywords: ["speed", "slow"] },
    { value: "security", label: "security", keywords: ["vulnerability"] },
    { value: "refactor", label: "refactor", keywords: ["cleanup"] },
  ]
</script>

<Autocomplete filter="startsWith">
  <div data-slot="stack">
    <AutocompleteLabel>Tag</AutocompleteLabel>
    <AutocompleteInput placeholder="Try “bug”" />
  </div>
  <AutocompleteContent>
    <AutocompleteEmpty>No tags found.</AutocompleteEmpty>
    <AutocompleteList>
      {#each tags as tag (tag.value)}
        <AutocompleteItem
          value={tag.value}
          label={tag.label}
          keywords={tag.keywords}
        >
          {tag.label}
          <span data-slot="hint">{tag.keywords[0]}</span>
        </AutocompleteItem>
      {/each}
    </AutocompleteList>
  </AutocompleteContent>
</Autocomplete>
