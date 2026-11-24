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
          {pages.map((page) => (
            <AutocompleteItem
              key={page.href}
              value={page.title}
              label={page.title}
              render={<a href={page.href} />}
            >
              {page.title}
              <span data-slot="hint">{page.section}</span>
            </AutocompleteItem>
          ))}
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  )
}

export { Example }
