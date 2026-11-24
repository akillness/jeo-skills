import { Checkbox, CheckboxIndicator } from "@ui-sdk/solid/checkbox"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        const entries = [...new FormData(event.currentTarget)].map(
          ([name, value]) => `${name}=${value}`
        )
        log(
          entries.length
            ? `Submitted ${entries.join("&")}`
            : "Submitted nothing"
        )
      }}
    >
      <Field>
        <Checkbox name="terms" value="yes" required>
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
        <div data-slot="stack">
          <FieldLabel>Accept terms and conditions</FieldLabel>
          <FieldDescription>
            You agree to our Terms of Service and Privacy Policy.
          </FieldDescription>
        </div>
      </Field>
      <Field>
        <Checkbox name="newsletter" value="weekly" defaultChecked>
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
        <div data-slot="stack">
          <FieldLabel>Send me the weekly newsletter</FieldLabel>
          <FieldDescription>
            Product news and tips, once a week. Unsubscribe anytime.
          </FieldDescription>
        </div>
      </Field>
      <div data-slot="row">
        <button type="submit">Create Account</button>
        <button type="reset">Reset</button>
      </div>
    </form>
  )
}

export { Example }
