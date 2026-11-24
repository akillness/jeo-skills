import {
  Command,
  CommandInput,
  CommandItem,
  CommandItemText,
  CommandList,
} from "@ui-sdk/solid/command"
import { For, Show } from "solid-js"

const pages = ["Composition", "Installation", "Styling"]

function Example() {
  return (
    <Command>
      <CommandInput aria-label="Search docs" placeholder="Search docs…" />
      <CommandList>
        <For each={pages}>
          {(page) => (
            <CommandItem
              value={page}
              render={(props) => (
                <a {...props} href={`#${page.toLowerCase()}`} />
              )}
            >
              {(state) => (
                <>
                  <CommandItemText>
                    {(text) => (
                      <For each={text.segments}>
                        {(segment) =>
                          segment.match ? (
                            <strong>{segment.text}</strong>
                          ) : (
                            segment.text
                          )
                        }
                      </For>
                    )}
                  </CommandItemText>
                  <Show when={state.highlighted}>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 4v7a4 4 0 0 1-4 4H4" />
                      <path d="m9 10-5 5 5 5" />
                    </svg>
                  </Show>
                </>
              )}
            </CommandItem>
          )}
        </For>
      </CommandList>
    </Command>
  )
}

export { Example }
