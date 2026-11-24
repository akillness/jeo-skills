// Importing this defines <ui-input>, <ui-textarea>, <ui-input-group> and their parts. On the server it does nothing.
import { defineInputElements, defineInputGroupElements } from "../input"

defineInputElements()
defineInputGroupElements()

export type {
  InputController,
  InputGroupOptions,
  InputGroupPrimitive,
  InputGroupState,
  InputOptions,
  InputPrimitive,
  InputProps,
  InputState,
  InputValueChangeReason,
  TextareaOptions,
  TextareaPrimitive,
  TextareaProps,
  TextareaState,
  TextareaSubmitDetails,
} from "@ui-sdk/core/input"
export type {
  InputEvents,
  UiInputElement,
  UiInputGroupElement,
} from "../events"
export { createInputController } from "@ui-sdk/core/input"
