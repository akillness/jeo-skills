"use client"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/react/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/react/radio"
import { useLog } from "../../../shared/react/log"

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
          {channels.map((channel) => (
            <label data-slot="label" key={channel.value}>
              <Radio value={channel.value}>
                <RadioIndicator />
              </Radio>
              {channel.label}
            </label>
          ))}
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
