import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  TokenInput,
  TokenInputEditor,
  type TokenInputValue,
} from "@ui-sdk/solid/token-input"
import { createSignal, createUniqueId } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const draft: TokenInputValue = [
  "Explain ",
  { type: "file", value: "src/routes.ts", label: "routes.ts" },
  " in two sentences.",
]

function Example() {
  const log = useLog()
  const [disabled, setDisabled] = createSignal(false)
  const [readOnly, setReadOnly] = createSignal(false)
  const formId = createUniqueId()

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <Checkbox
            checked={disabled()}
            onCheckedChange={(next) => setDisabled(next === true)}
          >
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
          Disabled
        </label>
        <label data-slot="label">
          <Checkbox
            checked={readOnly()}
            onCheckedChange={(next) => setReadOnly(next === true)}
          >
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
          Read-only
        </label>
      </div>
      <div data-slot="stack">
        <Field disabled={disabled()}>
          <FieldLabel>Prompt</FieldLabel>
          <TokenInput
            form={formId}
            name="prompt"
            required
            defaultValue={draft}
            readOnly={readOnly()}
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
