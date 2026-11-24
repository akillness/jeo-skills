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
      <FieldLabel>Verification code</FieldLabel>
      <OTPInput maxLength={6}>
        <OTPInputGroup>
          <OTPInputSlot index={0} />
          <OTPInputSlot index={1} />
          <OTPInputSlot index={2} />
        </OTPInputGroup>
        <OTPInputSeparator>
          <MinusIcon aria-hidden="true" />
        </OTPInputSeparator>
        <OTPInputGroup>
          <OTPInputSlot index={3} />
          <OTPInputSlot index={4} />
          <OTPInputSlot index={5} />
        </OTPInputGroup>
      </OTPInput>
    </Field>
  )
}

export { Example }
