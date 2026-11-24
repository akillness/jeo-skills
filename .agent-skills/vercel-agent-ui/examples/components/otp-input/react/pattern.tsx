"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/react/otp-input"

function Example() {
  return (
    <Field>
      <FieldLabel>Device code</FieldLabel>
      <OTPInput maxLength={6} pattern={/[0-9A-F]/i} inputMode="text">
        <OTPInputGroup>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <OTPInputSlot key={index} index={index} />
          ))}
        </OTPInputGroup>
      </OTPInput>
    </Field>
  )
}

export { Example }
