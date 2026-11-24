import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/solid/checkbox"
import { For } from "solid-js"

const toppings = [
  { value: "cheese", label: "جبن" },
  { value: "mushrooms", label: "فطر" },
  { value: "olives", label: "زيتون" },
  { value: "peppers", label: "فلفل" },
]

export function Example() {
  return (
    <div data-slot="stack" dir="rtl">
      <h3 id="rtl-toppings">الإضافات</h3>
      <CheckboxGroup aria-labelledby="rtl-toppings" defaultValue={["cheese"]}>
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
