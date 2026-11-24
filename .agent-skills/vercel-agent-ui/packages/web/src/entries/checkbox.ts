// Importing this defines <ui-checkbox>, <ui-checkbox-group> and their parts. On the server it does nothing.
import {
  defineCheckboxElements,
  defineCheckboxGroupElements,
} from "../checkbox"

defineCheckboxElements()
defineCheckboxGroupElements()

export type {
  CheckboxApi,
  CheckboxChangeOptions,
  CheckboxCheckedChangeReason,
  CheckboxController,
  CheckboxGroupApi,
  CheckboxGroupChangeOptions,
  CheckboxGroupController,
  CheckboxGroupOptions,
  CheckboxGroupPrimitive,
  CheckboxGroupState,
  CheckboxGroupValueChangeReason,
  CheckboxIndicatorProps,
  CheckboxIndicatorState,
  CheckboxOptions,
  CheckboxPrimitive,
  CheckboxState,
  CheckedState,
} from "@ui-sdk/core/checkbox"
export type {
  CheckboxEvents,
  CheckboxGroupEvents,
  UiCheckboxElement,
  UiCheckboxGroupElement,
} from "../events"
export {
  createCheckboxController,
  createCheckboxGroupController,
} from "@ui-sdk/core/checkbox"
