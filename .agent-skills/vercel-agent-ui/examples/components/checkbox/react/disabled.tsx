import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { CheckIcon } from "lucide-react"

function Example() {
  return (
    <div data-slot="stack">
      <label data-slot="label">
        <Checkbox defaultChecked>
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        Product updates
      </label>
      <label data-slot="label">
        <Checkbox defaultChecked disabled>
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        Security alerts
      </label>
    </div>
  )
}

export { Example }
