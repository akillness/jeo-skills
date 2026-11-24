import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/solid/otp-input"
import { For } from "solid-js"

function Example() {
  return (
    <Field>
      <FieldLabel>PIN</FieldLabel>
      <OTPInput maxLength={4} textAlign="center">
        <OTPInputGroup>
          <For each={[0, 1, 2, 3]}>
            {(index) => <OTPInputSlot index={index} />}
          </For>
        </OTPInputGroup>
      </OTPInput>
    </Field>
  )
}

export { Example }
