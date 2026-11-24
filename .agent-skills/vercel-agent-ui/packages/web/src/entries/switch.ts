// Importing this defines <ui-switch> and its parts. On the server it does nothing.
import { defineSwitchElements } from "../checkbox"

defineSwitchElements()

export type {
  SwitchApi,
  SwitchCheckedChangeReason,
  SwitchController,
  SwitchOptions,
  SwitchPrimitive,
  SwitchState,
  SwitchThumbState,
} from "@ui-sdk/core/switch"
export type { SwitchEvents, UiSwitchElement } from "../events"
export { createSwitchController } from "@ui-sdk/core/switch"
