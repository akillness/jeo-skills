import { Listbox, ListboxItem } from "@ui-sdk/solid/listbox"
import { For } from "solid-js"

const sizes = [
  { value: "xs", label: "XS" },
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
  { value: "xl", label: "XL", disabled: true },
]

function Example() {
  return (
    <Listbox
      orientation="horizontal"
      loop={false}
      defaultValue="m"
      aria-label="Size"
    >
      <For each={sizes}>
        {(size) => (
          <ListboxItem value={size.value} disabled={size.disabled}>
            {size.label}
          </ListboxItem>
        )}
      </For>
    </Listbox>
  )
}

export { Example }
