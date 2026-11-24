"use client"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/react/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/react/otp-input"
import { useLog } from "../../../shared/react/log"

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
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <OTPInputSlot key={index} index={index} />
              ))}
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
            {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
              <OTPInputSlot key={index} index={index} />
            ))}
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
