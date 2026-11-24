// Importing this defines <ui-date-picker>, its parts and the Calendar parts inside it. On the server it does nothing.
import { defineDatePickerElements } from "../date-picker"

defineDatePickerElements()

export type {
  CalendarDayState,
  CalendarGridCell,
  CalendarGridState,
  CalendarHeadingState,
  CalendarSelectOption,
  CalendarSelectState,
  CalendarStepState,
  CalendarWeekdayState,
  DateMatcher,
  DateMatchers,
  DatePickerApi,
  DatePickerChangeOptions,
  DatePickerClearState,
  DatePickerContentProps,
  DatePickerContentState,
  DatePickerController,
  DatePickerDismissReason,
  DatePickerHintState,
  DatePickerInputProps,
  DatePickerInputState,
  DatePickerMode,
  DatePickerMonthChangeReason,
  DatePickerOpenChangeReason,
  DatePickerOptions,
  DatePickerPresetProps,
  DatePickerPresetState,
  DatePickerPrimitive,
  DatePickerState,
  DatePickerTriggerState,
  DatePickerValue,
  DatePickerValueChangeReason,
  ISOMonth,
} from "@ui-sdk/core/date-picker"
export type { DatePickerEvents, UiDatePickerElement } from "../events"
export { createDatePickerController } from "@ui-sdk/core/date-picker"
