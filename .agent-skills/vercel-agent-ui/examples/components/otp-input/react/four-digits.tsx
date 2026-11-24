"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/react/otp-input"

function Example() {
  return (
    <Field>
      <FieldLabel>PIN</FieldLabel>
      <OTPInput maxLength={4} textAlign="center">
        <OTPInputGroup>
          {[0, 1, 2, 3].map((index) => (
            <OTPInputSlot key={index} index={index} />
          ))}
        </OTPInputGroup>
      </OTPInput>
    </Field>
  )
}

export { Example }
