import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { Label } from "@ui-sdk/react/label"
import { CheckIcon } from "lucide-react"

function Example() {
  return (
    <Label>
      <Checkbox>
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      Accept terms and conditions
    </Label>
  )
}

export { Example }
