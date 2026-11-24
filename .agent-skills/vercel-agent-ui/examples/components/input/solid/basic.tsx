import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { Input, InputClear, InputGroup } from "@ui-sdk/solid/input"
import { useLog } from "../../../shared/solid/log"

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
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </InputClear>
      </InputGroup>
      <FieldDescription>Shown on your public profile.</FieldDescription>
    </Field>
  )
}

export { Example }
