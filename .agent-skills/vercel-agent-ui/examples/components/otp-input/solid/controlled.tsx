import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/solid/otp-input"
import { createSignal, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  const [value, setValue] = createSignal("")

  return (
    <Field>
      <FieldLabel>One-time password</FieldLabel>
      <OTPInput
        value={value()}
        onValueChange={(value, details) => {
          setValue(value)
          log(`${value || "Empty"} (${details.reason})`)
        }}
      >
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
