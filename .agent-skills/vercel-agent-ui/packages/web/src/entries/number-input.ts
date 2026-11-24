// Importing this defines <ui-number-input> and its parts. On the server it does nothing.
import { defineNumberInputElements } from "../number-input"

defineNumberInputElements()

export type {
  NumberInputApi,
  NumberInputButtonProps,
  NumberInputButtonState,
  NumberInputChangeOptions,
  NumberInputController,
  NumberInputOptions,
  NumberInputPrimitive,
  NumberInputScrubAreaProps,
  NumberInputState,
  NumberInputValueChangeReason,
} from "@ui-sdk/core/number-input"
export type { NumberInputEvents, UiNumberInputElement } from "../events"
export { createNumberInputController } from "@ui-sdk/core/number-input"
