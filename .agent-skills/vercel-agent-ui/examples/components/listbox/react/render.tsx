"use client"

import { Listbox, ListboxItem } from "@ui-sdk/react/listbox"
import { ExternalLinkIcon } from "lucide-react"

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "nuxt", label: "Nuxt" },
  { value: "sveltekit", label: "SvelteKit" },
]

function Example() {
  return (
    <Listbox
      defaultValue="next"
      activation="manual"
      aria-label="Framework docs"
    >
      {frameworks.map((framework) => (
        <ListboxItem
          key={framework.value}
          value={framework.value}
          label={framework.label}
          render={<a href={`#${framework.value}`} />}
        >
          {(state) => (
            <>
              <span>{framework.label}</span>
              {state.selected && <ExternalLinkIcon aria-hidden="true" />}
            </>
          )}
        </ListboxItem>
      ))}
    </Listbox>
  )
}

export { Example }
