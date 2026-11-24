export { default as OTPInput } from "./otp-input/otp-input.svelte"
export { default as OTPInputGroup } from "./otp-input/otp-input-group.svelte"
export { default as OTPInputSeparator } from "./otp-input/otp-input-separator.svelte"
export { default as OTPInputSlot } from "./otp-input/otp-input-slot.svelte"
export { createOTPInputController } from "@ui-sdk/core/otp-input"
export type {
  OTPInputApi,
  OTPInputChangeOptions,
  OTPInputController,
  OTPInputOptions,
  OTPInputPattern,
  OTPInputSlotData,
  OTPInputSlotProps,
  OTPInputSlotState,
  OTPInputState,
  OTPInputValueChangeReason,
  OtpInputPrimitive,
} from "@ui-sdk/core/otp-input"
