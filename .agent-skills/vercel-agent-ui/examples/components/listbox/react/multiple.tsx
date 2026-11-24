"use client"

import {
  Listbox,
  ListboxItem,
  ListboxItemIndicator,
} from "@ui-sdk/react/listbox"
import { CheckIcon } from "lucide-react"
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

  return (
    <Listbox
      multiple
      defaultValue={["cheese", "onion"]}
      onValueChange={(value, details) =>
        log(`${value.join(", ") || "Nothing"} (${details.reason})`)
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
  )
}

export { Example }
