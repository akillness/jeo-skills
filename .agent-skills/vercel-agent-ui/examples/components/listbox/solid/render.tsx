import { Listbox, ListboxItem } from "@ui-sdk/solid/listbox"
import { For, Show } from "solid-js"

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
      <For each={frameworks}>
        {(framework) => (
          <ListboxItem
            value={framework.value}
            label={framework.label}
            render={(props) => <a {...props} href={`#${framework.value}`} />}
          >
            {(state) => (
              <>
                <span>{framework.label}</span>
                <Show when={state.selected}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M15 3h6v6" />
                    <path d="M10 14 21 3" />
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  </svg>
                </Show>
              </>
            )}
          </ListboxItem>
        )}
      </For>
    </Listbox>
  )
}

export { Example }
