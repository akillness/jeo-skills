// Importing this defines <ui-calendar> and its parts. On the server it does nothing.
import { defineCalendarElements } from "../calendar"

defineCalendarElements()

export type {
  CalendarAnchorChangeReason,
  CalendarApi,
  CalendarChangeOptions,
  CalendarController,
  CalendarDayProps,
  CalendarDayState,
  CalendarFocusedChangeReason,
  CalendarGridCell,
  CalendarGridProps,
  CalendarGridState,
  CalendarHeadingState,
  CalendarMode,
  CalendarMonthChangeReason,
  CalendarOptions,
  CalendarPrimitive,
  CalendarSelectOption,
  CalendarSelectState,
  CalendarState,
  CalendarStepState,
  CalendarValue,
  CalendarValueChangeReason,
  CalendarWeekdayProps,
  CalendarWeekdayState,
  DateMatcher,
  DateMatchers,
  ISOMonth,
} from "@ui-sdk/core/calendar"
export type { CalendarEvents, UiCalendarElement } from "../events"
export { createCalendarController } from "@ui-sdk/core/calendar"
