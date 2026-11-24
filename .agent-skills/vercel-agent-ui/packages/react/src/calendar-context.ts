import type {
  calendar as calendarPrimitive,
  CalendarGridState,
} from "@ui-sdk/core/calendar"
import * as React from "react"
import type { PrimitiveHandle } from "./use-primitive"

// The calendar the parts render: a Calendar, or the one inside a Date Picker,
// whose primitive has the same parts.
type CalendarHandle = PrimitiveHandle<typeof calendarPrimitive>

const CalendarContext = React.createContext<CalendarHandle | null>(null)
const GridContext = React.createContext<{
  offset: number
  state: CalendarGridState
} | null>(null)

export { CalendarContext, type CalendarHandle, GridContext }
