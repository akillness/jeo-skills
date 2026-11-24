import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@ui-sdk/solid/combobox"
import { For, Show } from "solid-js"

const users = [
  { id: 1, name: "Hollis Grant", username: "hollis", role: "Owner" },
  { id: 2, name: "Inès Moreau", username: "ines", role: "Admin" },
  { id: 3, name: "Kofi Mensah", username: "kofi", role: "Member" },
  { id: 4, name: "Wren Takahashi", username: "wren", role: "Member" },
  { id: 5, name: "Tomasz Wójcik", username: "tomasz", role: "Guest" },
]

function Example() {
  return (
    <Combobox>
      <div data-slot="stack">
        <ComboboxLabel>Assignee</ComboboxLabel>
        <div data-slot="row">
          <ComboboxInput
            placeholder="Search people…"
            render={(props) => (
              <div data-slot="row">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m21 21-4.34-4.34" />
                  <circle cx="11" cy="11" r="8" />
                </svg>
                <input {...props} />
              </div>
            )}
          />
          <ComboboxTrigger aria-label="Show people">
            {(state) => (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d={state.open ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} />
              </svg>
            )}
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No one by that name.</ComboboxEmpty>
        <ComboboxList>
          <For each={users}>
            {(user) => (
              <ComboboxItem
                value={user.username}
                label={user.name}
                keywords={[user.username]}
              >
                {(state) => (
                  <>
                    <span data-slot="badge">{user.name.slice(0, 1)}</span>
                    <span data-slot="stack">
                      {user.name}
                      <span data-slot="hint">@{user.username}</span>
                    </span>
                    <Show
                      when={state.selected}
                      fallback={
                        <Show when={state.highlighted}>
                          <kbd data-slot="kbd">Enter</kbd>
                        </Show>
                      }
                    >
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
                    </Show>
                  </>
                )}
              </ComboboxItem>
            )}
          </For>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }
