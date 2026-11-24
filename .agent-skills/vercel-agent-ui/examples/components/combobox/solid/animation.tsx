import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@ui-sdk/solid/combobox"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const frameworks = [
  { value: "next", label: "Next.js" },
  { value: "sveltekit", label: "SvelteKit" },
  { value: "nuxt", label: "Nuxt" },
  { value: "remix", label: "Remix" },
  { value: "astro", label: "Astro" },
  { value: "solidstart", label: "SolidStart" },
  { value: "qwik", label: "Qwik City" },
]

function Example() {
  const log = useLog()

  return (
    <Combobox
      onOpenChangeComplete={(open) =>
        log(open ? "Finished opening" : "Finished closing")
      }
    >
      <div data-slot="stack">
        <ComboboxLabel>Framework</ComboboxLabel>
        <div data-slot="row">
          <ComboboxInput placeholder="Select a framework" />
          <ComboboxTrigger aria-label="Show frameworks">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No frameworks found.</ComboboxEmpty>
        <ComboboxList>
          <For each={frameworks}>
            {(framework) => (
              <ComboboxItem value={framework.value} label={framework.label}>
                {framework.label}
                <ComboboxItemIndicator keepMounted>
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
                </ComboboxItemIndicator>
              </ComboboxItem>
            )}
          </For>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
