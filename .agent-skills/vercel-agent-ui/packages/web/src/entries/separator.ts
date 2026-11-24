// Importing this defines <ui-separator> and its parts. On the server it does nothing.
import { defineSeparatorElements } from "../separator"

defineSeparatorElements()

export type {
  SeparatorOptions,
  SeparatorOrientation,
  SeparatorPrimitive,
  SeparatorState,
} from "@ui-sdk/core/separator"
export type { UiSeparatorElement } from "../events"
