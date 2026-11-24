import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/solid/otp-input"
import { For } from "solid-js"

function Example() {
  return (
    <OTPInput maxLength={5} aria-label="Invite code">
      {(state) => (
        <OTPInputGroup>
          <For each={state.slots} keyed={false}>
            {(_, index) => (
              <OTPInputSlot
                index={index}
                render={(props) => <span {...props} />}
              >
                {(slot) => slot.char ?? (slot.hasFakeCaret && <span />)}
              </OTPInputSlot>
            )}
          </For>
        </OTPInputGroup>
      )}
    </OTPInput>
  )
}

export { Example }
