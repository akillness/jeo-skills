<script setup lang="ts">
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
} from "@ui-sdk/vue/autocomplete"

const tags = [
  { value: "feature", label: "feature", keywords: ["enhancement", "request"] },
  { value: "fix", label: "fix", keywords: ["bug", "patch"] },
  { value: "docs", label: "docs", keywords: ["documentation", "readme"] },
  { value: "performance", label: "performance", keywords: ["speed", "slow"] },
  { value: "security", label: "security", keywords: ["vulnerability"] },
  { value: "refactor", label: "refactor", keywords: ["cleanup"] },
]
</script>

<template>
  <Autocomplete filter="startsWith">
    <div data-slot="stack">
      <AutocompleteLabel>Tag</AutocompleteLabel>
      <AutocompleteInput placeholder="Try “bug”" />
    </div>
    <AutocompleteContent>
      <AutocompleteEmpty>No tags found.</AutocompleteEmpty>
      <AutocompleteList>
        <AutocompleteItem
          v-for="tag in tags"
          :key="tag.value"
          :value="tag.value"
          :label="tag.label"
          :keywords="tag.keywords"
        >
          {{ tag.label }}
          <span data-slot="hint">{{ tag.keywords[0] }}</span>
        </AutocompleteItem>
      </AutocompleteList>
    </AutocompleteContent>
  </Autocomplete>
</template>
