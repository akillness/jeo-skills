import { Field, FieldDescription, FieldLabel } from "@ui-sdk/react/field"
import { Input, InputClear, InputGroup } from "@ui-sdk/react/input"
import { XIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()

  return (
    <Field name="website">
      <FieldLabel>Website</FieldLabel>
      <InputGroup>
        <span>https://</span>
        <Input
          placeholder="example.com"
          defaultValue="hollisgrant.com"
          onValueChange={(value, details) =>
            log(`${value ? `“${value}”` : "Empty"} (${details.reason})`)
          }
        />
        <InputClear aria-label="Clear website">
          <XIcon aria-hidden="true" />
        </InputClear>
      </InputGroup>
      <FieldDescription>Shown on your public profile.</FieldDescription>
    </Field>
  )
}

export { Example }
