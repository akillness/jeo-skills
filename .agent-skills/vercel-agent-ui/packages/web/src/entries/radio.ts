// Importing this defines <ui-radio-group> and its parts. On the server it does nothing.
import { defineRadioGroupElements } from "../radio"

defineRadioGroupElements()

export type {
  RadioGroupApi,
  RadioGroupChangeOptions,
  RadioGroupController,
  RadioGroupOptions,
  RadioGroupPrimitive,
  RadioGroupState,
  RadioGroupValueChangeReason,
  RadioIndicatorProps,
  RadioIndicatorState,
  RadioProps,
  RadioState,
} from "@ui-sdk/core/radio"
export type {
  RadioGroupEvents,
  UiRadioElement,
  UiRadioGroupElement,
} from "../events"
export { createRadioGroupController } from "@ui-sdk/core/radio"
