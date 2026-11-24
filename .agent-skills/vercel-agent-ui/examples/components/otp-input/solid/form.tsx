import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/solid/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/solid/otp-input"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()

  return (
    <div data-slot="stack">
      <form
        id="verify-sign-in"
        onSubmit={(event) => {
          event.preventDefault()
          const data = [...new FormData(event.currentTarget)].map(
            ([name, value]) => `${name}=${value}`
          )
          log(`Submitted ${data.join(", ")}`)
        }}
      >
        <Field>
          <FieldLabel>Verification code</FieldLabel>
          <OTPInput name="code" required>
            <OTPInputGroup>
              <For each={[0, 1, 2, 3, 4, 5]}>
                {(index) => <OTPInputSlot index={index} />}
              </For>
            </OTPInputGroup>
          </OTPInput>
          <FieldDescription>
            Enter the six-digit code we sent to hollis@example.com.
          </FieldDescription>
          <FieldError />
        </Field>
      </form>
      <Field>
        <FieldLabel>Recovery code (optional)</FieldLabel>
        <OTPInput
          name="recovery"
          form="verify-sign-in"
          maxLength={8}
          pattern="alphanumeric"
        >
          <OTPInputGroup>
            <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>
              {(index) => <OTPInputSlot index={index} />}
            </For>
          </OTPInputGroup>
        </OTPInput>
        <FieldError />
      </Field>
      <div data-slot="row">
        <button type="reset" form="verify-sign-in">
          Reset
        </button>
        <button type="submit" form="verify-sign-in" data-variant="solid">
          Verify
        </button>
      </div>
    </div>
  )
}

export { Example }
