// Importing this defines <ui-time-input> and its segments. On the server it does nothing.
import { defineTimeInputElements } from "../date-input"

defineTimeInputElements()

export type {
  HourCycle,
  TimeInputApi,
  TimeInputChangeOptions,
  TimeInputController,
  TimeInputGranularity,
  TimeInputOptions,
  TimeInputPrimitive,
  TimeInputSegmentData,
  TimeInputSegmentProps,
  TimeInputSegmentState,
  TimeInputSegmentType,
  TimeInputState,
  TimeInputValueChangeReason,
} from "@ui-sdk/core/time-input"
export type { TimeInputEvents, UiTimeInputElement } from "../events"
export { createTimeInputController } from "@ui-sdk/core/time-input"
