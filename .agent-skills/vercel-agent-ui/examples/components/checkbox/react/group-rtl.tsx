import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/react/checkbox"
import { CheckIcon } from "lucide-react"

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
        {toppings.map((topping) => (
          <label data-slot="label" key={topping.value}>
            <Checkbox value={topping.value}>
              <CheckboxIndicator>
                <CheckIcon />
              </CheckboxIndicator>
            </Checkbox>
            {topping.label}
          </label>
        ))}
      </CheckboxGroup>
    </div>
  )
}
