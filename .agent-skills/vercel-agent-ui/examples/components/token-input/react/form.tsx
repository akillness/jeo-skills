import { Checkbox, CheckboxIndicator } from "@ui-sdk/react/checkbox"
import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  TokenInput,
  TokenInputEditor,
  type TokenInputValue,
} from "@ui-sdk/react/token-input"
import { CheckIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

const draft: TokenInputValue = [
  "Explain ",
  { type: "file", value: "src/routes.ts", label: "routes.ts" },
  " in two sentences.",
]

function Example() {
  const log = useLog()
  const [disabled, setDisabled] = React.useState(false)
  const [readOnly, setReadOnly] = React.useState(false)
  const formId = React.useId()

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <Checkbox
            checked={disabled}
            onCheckedChange={(next) => setDisabled(next === true)}
          >
            <CheckboxIndicator>
              <CheckIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          Disabled
        </label>
        <label data-slot="label">
          <Checkbox
            checked={readOnly}
            onCheckedChange={(next) => setReadOnly(next === true)}
          >
            <CheckboxIndicator>
              <CheckIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          Read-only
        </label>
      </div>
      <div data-slot="stack">
        <Field disabled={disabled}>
          <FieldLabel>Prompt</FieldLabel>
          <TokenInput
            form={formId}
            name="prompt"
            required
            defaultValue={draft}
            readOnly={readOnly}
          >
            <TokenInputEditor />
          </TokenInput>
        </Field>
        <form
          id={formId}
          data-slot="row"
          onSubmit={(event) => {
            event.preventDefault()
            log(
              `Submitted ${new FormData(event.currentTarget).get("prompt") ?? ""}`
            )
          }}
        >
          <button type="submit" data-variant="solid">
            Submit
          </button>
          <button type="reset">Reset</button>
        </form>
      </div>
    </div>
  )
}

export { Example }
