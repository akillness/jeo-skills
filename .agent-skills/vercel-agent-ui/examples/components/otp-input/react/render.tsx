"use client"

import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/react/otp-input"

function Example() {
  return (
    <OTPInput maxLength={5} aria-label="Invite code">
      {(state) => (
        <OTPInputGroup>
          {state.slots.map((_, index) => (
            <OTPInputSlot key={index} index={index} render={<span />}>
              {(slot) => slot.char ?? (slot.hasFakeCaret && <span />)}
            </OTPInputSlot>
          ))}
        </OTPInputGroup>
      )}
    </OTPInput>
  )
}

export { Example }
