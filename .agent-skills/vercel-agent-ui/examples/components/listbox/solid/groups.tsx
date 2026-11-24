import {
  Listbox,
  ListboxGroup,
  ListboxGroupLabel,
  ListboxItem,
  ListboxItemIndicator,
  ListboxSeparator,
} from "@ui-sdk/solid/listbox"
import { For, Show } from "solid-js"

const produce = [
  {
    label: "Fruits",
    items: [
      { value: "apple", label: "Apple" },
      { value: "banana", label: "Banana" },
      { value: "orange", label: "Orange" },
    ],
  },
  {
    label: "Vegetables",
    items: [
      { value: "carrot", label: "Carrot" },
      { value: "broccoli", label: "Broccoli" },
      { value: "spinach", label: "Spinach" },
    ],
  },
]

function Example() {
  return (
    <Listbox multiple defaultValue={["banana"]} aria-label="Produce">
      <For each={produce}>
        {(group, index) => (
          <>
            <Show when={index() > 0}>
              <ListboxSeparator />
            </Show>
            <ListboxGroup>
              <ListboxGroupLabel>{group.label}</ListboxGroupLabel>
              <For each={group.items}>
                {(item) => (
                  <ListboxItem value={item.value}>
                    {item.label}
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
            </ListboxGroup>
          </>
        )}
      </For>
    </Listbox>
  )
}

export { Example }
