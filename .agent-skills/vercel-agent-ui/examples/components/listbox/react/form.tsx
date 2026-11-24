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
    <div data-slot="stack">
      <Listbox
        multiple
        name="toppings"
        form="pizza-order"
        required
        defaultValue={["cheese"]}
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
      <form
        id="pizza-order"
        data-slot="row"
        onSubmit={(event) => {
          event.preventDefault()
          log(
            `Ordered ${new FormData(event.currentTarget).getAll("toppings").join(", ")}`
          )
        }}
      >
        <button type="reset">Reset</button>
        <button data-variant="solid">Order</button>
      </form>
    </div>
  )
}

export { Example }
