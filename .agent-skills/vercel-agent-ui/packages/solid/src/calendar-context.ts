import type { calendar as calendarPrimitive } from "@ui-sdk/core/calendar"
import { createContext } from "solid-js"
import type { PrimitiveHandle } from "./use-primitive"

// The calendar the parts render: a Calendar, or the one inside a Date Picker,
// whose primitive has the same parts.
type CalendarHandle = PrimitiveHandle<typeof calendarPrimitive>

const CalendarContext = createContext<CalendarHandle | null>(null)

// How many months a calendar shows, for a grid each. At least one.
const monthCount = (months: number | undefined) =>
  Math.max(1, Math.floor(months ?? 1) || 1)

export { CalendarContext, type CalendarHandle, monthCount }
