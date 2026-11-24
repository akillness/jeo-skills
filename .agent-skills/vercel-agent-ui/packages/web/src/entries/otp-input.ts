// Importing this defines <ui-otp-input> and its parts. On the server it does nothing.
import { defineOTPInputElements } from "../otp-input"

defineOTPInputElements()

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
export type { OTPInputEvents, UiOTPInputElement } from "../events"
export { createOTPInputController } from "@ui-sdk/core/otp-input"
