"use client"

import { Field, FieldError, FieldLabel } from "@ui-sdk/react/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/react/otp-input"
import * as React from "react"

function Example() {
  const [invalid, setInvalid] = React.useState(true)

  return (
    <Field invalid={invalid}>
      <FieldLabel>Verification code</FieldLabel>
      <OTPInput defaultValue="482913" onValueChange={() => setInvalid(false)}>
        <OTPInputGroup>
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <OTPInputSlot key={index} index={index} />
          ))}
        </OTPInputGroup>
      </OTPInput>
      <FieldError>That code has expired. Request a new one.</FieldError>
    </Field>
  )
}

export { Example }
