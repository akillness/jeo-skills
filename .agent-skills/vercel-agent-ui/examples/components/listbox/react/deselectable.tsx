"use client"

import {
  Listbox,
  ListboxItem,
  ListboxItemIndicator,
} from "@ui-sdk/react/listbox"
import { CheckIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "nuxt", label: "Nuxt" },
  { value: "sveltekit", label: "SvelteKit" },
]

function Example() {
  const log = useLog()

  return (
    <Listbox
      deselectable
      defaultValue="astro"
      onValueChange={(value, details) =>
        log(`${value ?? "Nothing"} (${details.reason})`)
      }
      aria-label="Framework"
    >
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
