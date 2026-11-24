"use client"

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
} from "@ui-sdk/react/autocomplete"

const tags = [
  { value: "feature", label: "feature", keywords: ["enhancement", "request"] },
  { value: "fix", label: "fix", keywords: ["bug", "patch"] },
  { value: "docs", label: "docs", keywords: ["documentation", "readme"] },
  { value: "performance", label: "performance", keywords: ["speed", "slow"] },
  { value: "security", label: "security", keywords: ["vulnerability"] },
  { value: "refactor", label: "refactor", keywords: ["cleanup"] },
]

function Example() {
  return (
    <Autocomplete filter="startsWith">
      <div data-slot="stack">
        <AutocompleteLabel>Tag</AutocompleteLabel>
        <AutocompleteInput placeholder="Try “bug”" />
      </div>
      <AutocompleteContent>
        <AutocompleteEmpty>No tags found.</AutocompleteEmpty>
        <AutocompleteList>
          {tags.map((tag) => (
            <AutocompleteItem
              key={tag.value}
              value={tag.value}
              label={tag.label}
              keywords={tag.keywords}
            >
              {tag.label}
              <span data-slot="hint">{tag.keywords[0]}</span>
            </AutocompleteItem>
          ))}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
