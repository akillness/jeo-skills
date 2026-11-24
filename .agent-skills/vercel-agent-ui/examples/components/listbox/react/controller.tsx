"use client"

import {
  createListboxController,
  Listbox,
  ListboxItem,
  ListboxItemIndicator,
} from "@ui-sdk/react/listbox"
import { CheckIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

const toppings = [
  { value: "basil", label: "Basil" },
  { value: "cheese", label: "Extra cheese" },
  { value: "mushroom", label: "Mushroom" },
  { value: "olive", label: "Olive" },
  { value: "onion", label: "Onion" },
  { value: "pepper", label: "Pepper" },
]

function Example() {
  const log = useLog()
  const [controller] = React.useState(() =>
    createListboxController<string, true>()
  )

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => controller.selectAll()}>
          Select All
        </button>
        <button type="button" onClick={() => controller.clear()}>
          Clear
        </button>
        <button type="button" onClick={() => controller.focus()}>
          Focus
        </button>
      </div>
      <Listbox
        multiple
        controller={controller}
        onValueChange={(value, details) =>
          log(`${value.length} selected (${details.reason})`)
        }
        aria-label="Toppings"
      >
        {toppings.map((topping) => (
          <ListboxItem key={topping.value} value={topping.value}>
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
