import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/solid/checkbox"
import { For } from "solid-js"

const toppings = [
  { value: "cheese", label: "Cheese" },
  { value: "mushrooms", label: "Mushrooms" },
  { value: "olives", label: "Olives" },
  { value: "peppers", label: "Peppers" },
]

function Example() {
  return (
    <div data-slot="stack">
      <h3 id="basic-toppings">Toppings</h3>
      <CheckboxGroup aria-labelledby="basic-toppings" defaultValue={["cheese"]}>
        <For each={toppings}>
          {(topping) => (
            <label data-slot="label">
              <Checkbox value={topping.value}>
                <CheckboxIndicator>
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
                </CheckboxIndicator>
              </Checkbox>
              {topping.label}
            </label>
          )}
        </For>
      </CheckboxGroup>
    </div>
  )
}

export { Example }
