"use client"

import {
  Listbox,
  ListboxItem,
  ListboxItemIndicator,
} from "@ui-sdk/react/listbox"
import { CheckIcon } from "lucide-react"

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "nuxt", label: "Nuxt" },
  { value: "sveltekit", label: "SvelteKit" },
]

function Example() {
  return (
    <Listbox readOnly defaultValue="nuxt" aria-label="Framework">
      {frameworks.map((framework) => (
        <ListboxItem key={framework.value} value={framework.value}>
          {framework.label}
          <ListboxItemIndicator>
            <CheckIcon aria-hidden="true" />
          </ListboxItemIndicator>
        </ListboxItem>
      ))}
    </Listbox>
  )
}

export { Example }
