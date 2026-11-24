// Importing this defines <ui-progress> and its parts. On the server it does nothing.
import { defineProgressElements } from "../progress"

defineProgressElements()

export type {
  GaugeLabelDetails,
  NumberFormat,
  ProgressOptions,
  ProgressPrimitive,
  ProgressState,
  ProgressStatus,
  ProgressValueState,
} from "@ui-sdk/core/progress"
export type { UiGaugeElement } from "../events"
