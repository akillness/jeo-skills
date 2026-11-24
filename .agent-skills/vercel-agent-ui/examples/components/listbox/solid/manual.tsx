import {
  Listbox,
  ListboxItem,
  ListboxItemIndicator,
} from "@ui-sdk/solid/listbox"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

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
      activation="manual"
      onValueChange={(value, details) =>
        log(`${value ?? "Nothing"} (${details.reason})`)
      }
      aria-label="Framework"
    >
      <For each={frameworks}>
        {(framework) => (
          <ListboxItem value={framework.value}>
            {framework.label}
            <ListboxItemIndicator>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </ListboxItemIndicator>
          </ListboxItem>
        )}
      </For>
    </Listbox>
  )
}

export { Example }
