import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/solid/otp-input"
import { For } from "solid-js"

function Example() {
  return (
    <Field dir="rtl">
      <FieldLabel>رمز التحقق</FieldLabel>
      <OTPInput maxLength={6}>
        <OTPInputGroup>
          <For each={[0, 1, 2, 3, 4, 5]}>
            {(index) => <OTPInputSlot index={index} />}
          </For>
        </OTPInputGroup>
      </OTPInput>
    </Field>
  )
}

export { Example }
