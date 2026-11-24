// Importing this defines <ui-toggle>, <ui-toggle-group> and their parts. On the server it does nothing.
import { defineToggleElements, defineToggleGroupElements } from "../toggle"

defineToggleElements()
defineToggleGroupElements()

export type {
  ToggleApi,
  ToggleChangeOptions,
  ToggleController,
  ToggleGroupApi,
  ToggleGroupChangeOptions,
  ToggleGroupController,
  ToggleGroupOptions,
  ToggleGroupOrientation,
  ToggleGroupPrimitive,
  ToggleGroupState,
  ToggleGroupValueChangeReason,
  ToggleIconProps,
  ToggleIconState,
  ToggleOptions,
  TogglePressedChangeReason,
  TogglePrimitive,
  ToggleState,
} from "@ui-sdk/core/toggle"
export type {
  ToggleEvents,
  ToggleGroupEvents,
  UiToggleElement,
  UiToggleGroupElement,
} from "../events"
export {
  createToggleController,
  createToggleGroupController,
} from "@ui-sdk/core/toggle"
