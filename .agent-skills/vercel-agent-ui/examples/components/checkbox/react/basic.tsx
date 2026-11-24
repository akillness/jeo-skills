import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { CheckIcon } from "lucide-react"

function Example() {
  return (
    <label data-slot="label">
      <Checkbox>
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Accept terms and conditions
    </label>
  )
}

export { Example }
