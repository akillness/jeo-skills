import type {
  calendar as calendarPrimitive,
  CalendarGridState,
} from "@ui-sdk/core/calendar"
import type { InjectionKey } from "vue"
import type { PrimitiveHandle } from "./use-primitive"

// The calendar the parts render: a Calendar, or the one inside a Date Picker,
// whose primitive has the same parts.
type CalendarHandle = PrimitiveHandle<typeof calendarPrimitive>

const CalendarKey: InjectionKey<CalendarHandle> = Symbol("calendar")
const GridKey: InjectionKey<{
  offset: () => number
  state: CalendarGridState
}> = Symbol("calendar-grid")

export { type CalendarHandle, CalendarKey, GridKey }
