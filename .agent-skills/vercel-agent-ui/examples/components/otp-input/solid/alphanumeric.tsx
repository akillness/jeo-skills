import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  OTPInput,
  OTPInputGroup,
  OTPInputSeparator,
  OTPInputSlot,
} from "@ui-sdk/solid/otp-input"
import { For } from "solid-js"

function Example() {
  return (
    <Field>
      <FieldLabel>Recovery code</FieldLabel>
      <OTPInput maxLength={8} pattern="alphanumeric">
        <OTPInputGroup>
          <For each={[0, 1, 2, 3]}>
            {(index) => <OTPInputSlot index={index} />}
          </For>
        </OTPInputGroup>
        <OTPInputSeparator>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14" />
          </svg>
        </OTPInputSeparator>
        <OTPInputGroup>
          <For each={[4, 5, 6, 7]}>
            {(index) => <OTPInputSlot index={index} />}
          </For>
        </OTPInputGroup>
      </OTPInput>
    </Field>
  )
}

export { Example }
