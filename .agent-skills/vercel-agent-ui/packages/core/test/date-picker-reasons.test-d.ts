// Compiled by `pnpm typecheck`, never run. Date Picker shares Calendar's api
// with wider change reasons, and each `@ts-expect-error` fails the build if
// its line stops being an error.
import type { CalendarApi } from "../src/components/calendar/calendar"
import type { DatePickerApi } from "../src/components/date-picker/date-picker-api"

declare const calendar: CalendarApi
declare const datePicker: DatePickerApi

datePicker.previous({ reason: "input-commit" })
datePicker.next({ reason: "preset-press" })
datePicker.setMonth("2026-10", { reason: "input-commit" })
datePicker.internal.setValue(null, "clear-press")
datePicker.internal.reveal("2026-10-27", "preset-press")

calendar.previous({ reason: "previous-press" })
// @ts-expect-error Calendar's months never change on a typed date.
calendar.previous({ reason: "input-commit" })
// @ts-expect-error Calendar has no presets.
calendar.setMonth("2026-10", { reason: "preset-press" })
// @ts-expect-error Calendar's value has no clear button.
calendar.setValue(null, { reason: "clear-press" })
// @ts-expect-error Date Picker lists no such reason.
datePicker.previous({ reason: "scroll" })
