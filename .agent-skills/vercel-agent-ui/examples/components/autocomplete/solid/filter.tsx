import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
} from "@ui-sdk/solid/autocomplete"
import { For } from "solid-js"

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
          <For each={tags}>
            {(tag) => (
              <AutocompleteItem
                value={tag.value}
                label={tag.label}
                keywords={tag.keywords}
              >
                {tag.label}
                <span data-slot="hint">{tag.keywords[0]}</span>
              </AutocompleteItem>
            )}
          </For>
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
