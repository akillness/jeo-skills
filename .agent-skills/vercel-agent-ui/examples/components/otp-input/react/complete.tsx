"use client"

import { Field, FieldLabel } from "@ui-sdk/react/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/react/otp-input"
import { useLog } from "../../../shared/react/log"

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
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <OTPInputSlot key={index} index={index} />
          ))}
        </OTPInputGroup>
      </OTPInput>
    </Field>
  )
}

export { Example }
