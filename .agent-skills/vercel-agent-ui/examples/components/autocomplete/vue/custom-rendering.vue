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

const pages = [
  { title: "Installation", section: "Get Started", href: "#installation" },
  { title: "Composition", section: "Concepts", href: "#composition" },
  { title: "Build Your Own", section: "Concepts", href: "#build-your-own" },
  { title: "Styling", section: "Guides", href: "#styling" },
  { title: "API Reference", section: "Reference", href: "#api-reference" },
  { title: "Accessibility", section: "Reference", href: "#accessibility" },
]
</script>

<template>
  <Autocomplete>
    <div data-slot="stack">
      <AutocompleteLabel>Jump to</AutocompleteLabel>
      <AutocompleteInput placeholder="e.g. Styling" />
    </div>
    <AutocompleteContent>
      <AutocompleteEmpty>No sections found.</AutocompleteEmpty>
      <AutocompleteList>
        <AutocompleteItem
          v-for="page in pages"
          :key="page.href"
          :value="page.title"
          :label="page.title"
        >
          <template #render="{ props }">
            <a v-bind="props" :href="page.href">
              {{ page.title }}
              <span data-slot="hint">{{ page.section }}</span>
            </a>
          </template>
        </AutocompleteItem>
      </AutocompleteList>
    </AutocompleteContent>
  </Autocomplete>
</template>
