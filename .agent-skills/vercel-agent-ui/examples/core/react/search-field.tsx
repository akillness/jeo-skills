import * as React from "react"
import { definePrimitive } from "@ui-sdk/core"
import { createParts } from "@ui-sdk/react/primitive"
import { XIcon } from "lucide-react"

type SearchFieldOptions = {
  onQueryChange?: (query: string) => void
}

type SearchFieldState = { query: string }

const searchField = definePrimitive({
  name: "search-field",
  options: { onQueryChange: "callback" },
  state: (_options: SearchFieldOptions): SearchFieldState => ({ query: "" }),
  api: (context) => ({
    search(query: string) {
      context.store.set({ query })
      context.options().onQueryChange?.(query)
    },
  }),
  slots: (slot) => ({
    root: slot({ attrs: () => ({ role: "search" }) }),
    input: slot({
      attrs: (state) => ({ type: "search", value: state.query }),
      on: {
        input: (event, { api }) =>
          api.search((event.target as HTMLInputElement).value),
        keydown: (event, { api }) => {
          if (event.key !== "Escape") {
            return
          }
          event.preventDefault()
          api.search("")
        },
      },
    }),
    clear: slot({
      present: (state) => state.query !== "",
      attrs: () => ({ type: "button", "aria-label": "Clear" }),
      press: ({ api }) => api.search(""),
    }),
  }),
})

const parts = createParts(searchField, {
  root: "div",
  input: "input",
  clear: "button",
})

const SearchField = parts.Root

const SearchFieldInput = parts.Input

const SearchFieldClear = parts.Clear

const fruits = [
  "Apple",
  "Apricot",
  "Banana",
  "Cherry",
  "Grape",
  "Mango",
  "Peach",
  "Pear",
  "Plum",
]

function Example() {
  const [query, setQuery] = React.useState("")
  const matches = fruits.filter((fruit) =>
    fruit.toLowerCase().includes(query.toLowerCase())
  )
  return (
    <div data-slot="stack">
      <SearchField onQueryChange={setQuery}>
        <SearchFieldInput
          aria-label="Search fruit"
          placeholder="Search fruit…"
        />
        <SearchFieldClear>
          <XIcon aria-hidden="true" />
        </SearchFieldClear>
      </SearchField>
      <p data-slot="hint">{matches.join(", ") || "No fruit matches."}</p>
    </div>
  )
}

export {
  Example,
  searchField,
  SearchField,
  SearchFieldClear,
  SearchFieldInput,
  type SearchFieldOptions,
  type SearchFieldState,
}
