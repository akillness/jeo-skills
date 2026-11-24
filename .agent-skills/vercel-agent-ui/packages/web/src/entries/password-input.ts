// Importing this defines <ui-password-input> and its parts. On the server it does nothing.
import { definePasswordInputElements } from "../password-input"

definePasswordInputElements()

export type {
  InputValueChangeReason,
  PasswordInputController,
  PasswordInputOptions,
  PasswordInputPrimitive,
  PasswordInputState,
  PasswordInputVisibleChangeReason,
} from "@ui-sdk/core/password-input"
export type { PasswordInputEvents, UiPasswordInputElement } from "../events"
export { createPasswordInputController } from "@ui-sdk/core/password-input"
