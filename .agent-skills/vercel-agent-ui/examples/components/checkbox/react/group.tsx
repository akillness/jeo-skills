import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/react/checkbox"
import { CheckIcon } from "lucide-react"

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
      </CheckboxGroup>
    </div>
  )
}

export { Example }
