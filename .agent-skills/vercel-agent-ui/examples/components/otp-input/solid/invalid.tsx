import { Field, FieldError, FieldLabel } from "@ui-sdk/solid/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/solid/otp-input"
import { createSignal, For } from "solid-js"

function Example() {
  const [invalid, setInvalid] = createSignal(true)

  return (
    <Field invalid={invalid()}>
      <FieldLabel>Verification code</FieldLabel>
      <OTPInput defaultValue="482913" onValueChange={() => setInvalid(false)}>
        <OTPInputGroup>
          <For each={[0, 1, 2, 3, 4, 5]}>
            {(index) => <OTPInputSlot index={index} />}
          </For>
        </OTPInputGroup>
      </OTPInput>
      <FieldError>That code has expired. Request a new one.</FieldError>
    </Field>
  )
}

export { Example }
