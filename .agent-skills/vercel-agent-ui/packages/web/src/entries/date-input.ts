// Importing this defines <ui-date-input> and its segments. On the server it does nothing.
import { defineDateInputElements } from "../date-input"

defineDateInputElements()

export type {
  DateInputApi,
  DateInputChangeOptions,
  DateInputController,
  DateInputGranularity,
  DateInputOptions,
  DateInputPrimitive,
  DateInputSegmentData,
  DateInputSegmentProps,
  DateInputSegmentState,
  DateInputSegmentType,
  DateInputState,
  DateInputValueChangeReason,
  DateMatcher,
  DateMatchers,
  HourCycle,
} from "@ui-sdk/core/date-input"
export type { DateInputEvents, UiDateInputElement } from "../events"
export { createDateInputController } from "@ui-sdk/core/date-input"
