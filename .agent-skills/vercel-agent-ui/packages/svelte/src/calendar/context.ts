import type { calendar, CalendarGridState } from "@ui-sdk/core/calendar"
import { getContext } from "svelte"
import type { PrimitiveHandle } from "../use-primitive.svelte"

// The calendar the parts render: a Calendar, or the one inside a Date Picker,
// whose primitive has the same parts.
type CalendarContext = PrimitiveHandle<typeof calendar>

// A grid's offset and state, for the rows and days inside it.
type CalendarGridContext = {
  readonly offset: number
  readonly state: CalendarGridState
}

const CalendarKey = Symbol("calendar")
const CalendarGridKey = Symbol("calendar-grid")

function useCalendar(part: string) {
  const context = getContext<CalendarContext | undefined>(CalendarKey)
  if (!context) {
    throw new Error(
      `${part} must be used inside <Calendar> or <DatePickerContent>.`
    )
  }
  return context
}

function useCalendarGrid(part: string) {
  const context = getContext<CalendarGridContext | undefined>(CalendarGridKey)
  if (!context) {
    throw new Error(`${part} must be used inside <CalendarGrid>.`)
  }
  return context
}

// The grid a day is in, if any. A day outside one belongs to the first month shown.
function useOptionalGrid() {
  return getContext<CalendarGridContext | undefined>(CalendarGridKey)
}

// The offsets of the months shown, from 0, for a grid each. At least one.
function monthOffsets(months: number | undefined) {
  return Array.from(
    { length: Math.max(1, Math.floor(months ?? 1) || 1) },
    (_, offset) => offset
  )
}

export {
  type CalendarContext,
  type CalendarGridContext,
  CalendarGridKey,
  CalendarKey,
  monthOffsets,
  useCalendar,
  useCalendarGrid,
  useOptionalGrid,
}
