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
      <h3 id="parent-toppings">Toppings</h3>
      <CheckboxGroup
        aria-labelledby="parent-toppings"
        defaultValue={["cheese", "olives"]}
        allValues={toppings.map((topping) => topping.value)}
      >
        <label data-slot="label">
          <Checkbox parent>
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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M5 12h14" />
              </svg>
            </CheckboxIndicator>
          </Checkbox>
          Select all
        </label>
        <div data-slot="stack">
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
        </div>
      </CheckboxGroup>
    </div>
  )
}

export { Example }
