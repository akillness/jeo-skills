// Importing this defines <ui-field> and its parts. On the server it does nothing.
import { defineFieldElements } from "../field"

defineFieldElements()

export type {
  FieldApi,
  FieldDescriptionState,
  FieldErrorProps,
  FieldErrorState,
  FieldGroupPrimitive,
  FieldOptions,
  FieldPrimitive,
  FieldSetOptions,
  FieldSetPrimitive,
  FieldSetState,
  FieldState,
  ValidityKey,
} from "@ui-sdk/core/field"
export type {
  UiFieldElement,
  UiFieldGroupElement,
  UiFieldSetElement,
} from "../events"
