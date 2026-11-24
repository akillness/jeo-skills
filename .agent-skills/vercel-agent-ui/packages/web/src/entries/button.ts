// Importing this defines <ui-button> and its parts. On the server it does nothing.
import { defineButtonElements } from "../button"

defineButtonElements()

export type {
  ButtonActionDetails,
  ButtonApi,
  ButtonOptions,
  ButtonPrimitive,
  ButtonState,
} from "@ui-sdk/core/button"
export type { ButtonEvents, UiButtonElement } from "../events"
