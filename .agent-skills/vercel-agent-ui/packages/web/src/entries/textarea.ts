// Importing this defines <ui-textarea>, <ui-input> and their parts. On the server it does nothing.
import { defineInputElements } from "../input"

defineInputElements()

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
export type { InputEvents, UiInputElement, UiTextareaElement } from "../events"
export { createInputController } from "@ui-sdk/core/input"
