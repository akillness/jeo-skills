"use client"

import {
  Listbox,
  ListboxGroup,
  ListboxGroupLabel,
  ListboxItem,
  ListboxItemIndicator,
  ListboxSeparator,
} from "@ui-sdk/react/listbox"
import { CheckIcon } from "lucide-react"
import * as React from "react"

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
      {produce.map((group, index) => (
        <React.Fragment key={group.label}>
          {index > 0 && <ListboxSeparator />}
          <ListboxGroup>
            <ListboxGroupLabel>{group.label}</ListboxGroupLabel>
            {group.items.map((item) => (
              <ListboxItem key={item.value} value={item.value}>
                {item.label}
                <ListboxItemIndicator>
                  <CheckIcon aria-hidden="true" />
                </ListboxItemIndicator>
              </ListboxItem>
            ))}
          </ListboxGroup>
        </React.Fragment>
      ))}
    </Listbox>
  )
}

export { Example }
