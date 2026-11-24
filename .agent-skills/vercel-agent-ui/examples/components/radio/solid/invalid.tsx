import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/solid/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/solid/radio"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const channels = [
  { value: "email", label: "Email only" },
  { value: "sms", label: "SMS only" },
  { value: "both", label: "Email and SMS" },
]

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        log(`Saved updates=${new FormData(event.currentTarget).get("updates")}`)
      }}
    >
      <Field>
        <FieldLabel>Order updates</FieldLabel>
        <FieldDescription>
          Choose how we tell you about your orders.
        </FieldDescription>
        <RadioGroup name="updates" required>
          <For each={channels}>
            {(channel) => (
              <label data-slot="label">
                <Radio value={channel.value}>
                  <RadioIndicator />
                </Radio>
                {channel.label}
              </label>
            )}
          </For>
        </RadioGroup>
        <FieldError>Choose how to get order updates.</FieldError>
      </Field>
      <div data-slot="row">
        <button type="submit" data-variant="solid">
          Save
        </button>
      </div>
    </form>
  )
}

export { Example }
