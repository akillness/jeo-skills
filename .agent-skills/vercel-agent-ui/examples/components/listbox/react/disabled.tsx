"use client"

import {
  Listbox,
  ListboxItem,
  ListboxItemIndicator,
} from "@ui-sdk/react/listbox"
import { CheckIcon } from "lucide-react"
import * as React from "react"

const toppings = [
  { value: "basil", label: "Basil" },
  { value: "cheese", label: "Extra cheese" },
  { value: "mushroom", label: "Mushroom" },
  { value: "olive", label: "Olive" },
  { value: "onion", label: "Onion" },
  { value: "pepper", label: "Pepper" },
]

function Example() {
  const [disabled, setDisabled] = React.useState(false)

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => setDisabled(!disabled)}>
          {disabled ? "Enable the List" : "Disable the List"}
        </button>
      </div>
      <Listbox
        multiple
        disabled={disabled}
        defaultValue={["basil"]}
        aria-label="Toppings"
      >
        {toppings.map((topping) => (
          <ListboxItem
            key={topping.value}
            value={topping.value}
            disabled={topping.value === "olive"}
          >
            {topping.label}
            <ListboxItemIndicator>
              <CheckIcon aria-hidden="true" />
            </ListboxItemIndicator>
          </ListboxItem>
        ))}
      </Listbox>
    </div>
  )
}

export { Example }
