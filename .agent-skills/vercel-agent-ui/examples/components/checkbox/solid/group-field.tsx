import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/solid/checkbox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/solid/field"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const channels = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "push", label: "Push notifications" },
]

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
        log(`Saved ${entries.join("&")}`)
      }}
    >
      <Field>
        <FieldLabel>Notifications</FieldLabel>
        <FieldDescription>
          Choose how we tell you about your orders.
        </FieldDescription>
        <CheckboxGroup name="notifications" required>
          <For each={channels}>
            {(channel) => (
              <label data-slot="label">
                <Checkbox value={channel.value}>
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
                {channel.label}
              </label>
            )}
          </For>
        </CheckboxGroup>
        <div>
          <FieldError>Choose at least one way to be notified.</FieldError>
        </div>
      </Field>
      <button type="submit">Save</button>
    </form>
  )
}

export { Example }
