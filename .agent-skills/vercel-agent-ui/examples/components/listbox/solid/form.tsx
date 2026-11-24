import {
  Listbox,
  ListboxItem,
  ListboxItemIndicator,
} from "@ui-sdk/solid/listbox"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

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
        <For each={toppings}>
          {(topping) => (
            <ListboxItem value={topping.value}>
              {topping.label}
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
