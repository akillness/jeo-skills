"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  OTPInput,
  OTPInputGroup,
  OTPInputSeparator,
  OTPInputSlot,
} from "@ui-sdk/react/otp-input"
import { MinusIcon } from "lucide-react"

function Example() {
  return (
    <Field>
      <FieldLabel>Recovery code</FieldLabel>
      <OTPInput maxLength={8} pattern="alphanumeric">
        <OTPInputGroup>
          {[0, 1, 2, 3].map((index) => (
            <OTPInputSlot key={index} index={index} />
          ))}
        </OTPInputGroup>
        <OTPInputSeparator>
          <MinusIcon aria-hidden="true" />
        </OTPInputSeparator>
        <OTPInputGroup>
          {[4, 5, 6, 7].map((index) => (
            <OTPInputSlot key={index} index={index} />
          ))}
        </OTPInputGroup>
      </OTPInput>
    </Field>
  )
}

export { Example }
