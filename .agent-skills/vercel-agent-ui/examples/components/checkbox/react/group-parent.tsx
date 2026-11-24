import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/react/checkbox"
import { CheckIcon, MinusIcon } from "lucide-react"

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
              <CheckIcon aria-hidden="true" />
              <MinusIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          Select all
        </label>
        <div data-slot="stack">
          {toppings.map((topping) => (
            <label data-slot="label" key={topping.value}>
              <Checkbox value={topping.value}>
                <CheckboxIndicator>
                  <CheckIcon aria-hidden="true" />
                </CheckboxIndicator>
              </Checkbox>
              {topping.label}
            </label>
          ))}
        </div>
      </CheckboxGroup>
    </div>
  )
}

export { Example }
