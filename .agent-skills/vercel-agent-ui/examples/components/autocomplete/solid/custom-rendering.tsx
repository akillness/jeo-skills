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

const pages = [
  { title: "Installation", section: "Get Started", href: "#installation" },
  { title: "Composition", section: "Concepts", href: "#composition" },
  { title: "Build Your Own", section: "Concepts", href: "#build-your-own" },
  { title: "Styling", section: "Guides", href: "#styling" },
  { title: "API Reference", section: "Reference", href: "#api-reference" },
  { title: "Accessibility", section: "Reference", href: "#accessibility" },
]

function Example() {
  return (
    <Autocomplete>
      <div data-slot="stack">
        <AutocompleteLabel>Jump to</AutocompleteLabel>
        <AutocompleteInput placeholder="e.g. Styling" />
      </div>
      <AutocompleteContent>
        <AutocompleteEmpty>No sections found.</AutocompleteEmpty>
        <AutocompleteList>
          <For each={pages}>
            {(page) => (
              <AutocompleteItem
                value={page.title}
                label={page.title}
                render={(props) => <a {...props} href={page.href} />}
              >
                {page.title}
                <span data-slot="hint">{page.section}</span>
              </AutocompleteItem>
            )}
          </For>
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
