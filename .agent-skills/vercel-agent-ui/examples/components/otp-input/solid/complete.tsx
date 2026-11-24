import { Field, FieldLabel } from "@ui-sdk/solid/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/solid/otp-input"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()

  return (
    <Field>
      <FieldLabel>Verification code</FieldLabel>
      <OTPInput
        onValueCommit={(value, details) =>
          log(`Checking ${value} (${details.reason})`)
        }
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
