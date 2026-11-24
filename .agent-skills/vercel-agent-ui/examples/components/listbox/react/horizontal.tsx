"use client"

import { Listbox, ListboxItem } from "@ui-sdk/react/listbox"

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
      {sizes.map((size) => (
        <ListboxItem
          key={size.value}
          value={size.value}
          disabled={size.disabled}
        >
          {size.label}
        </ListboxItem>
      ))}
    </Listbox>
  )
}

export { Example }
